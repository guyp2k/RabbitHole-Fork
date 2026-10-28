import ctypes
import http.client
import json
import os
import tempfile
import threading
import unittest

import hqp_host_monitor as m


def config(**overrides):
    raw = {"bind": "127.0.0.1", "port": 8099, "allow": ["127.0.0.1"], "interval_seconds": 5}
    raw.update(overrides)
    return raw


class ConfigTests(unittest.TestCase):
    def test_a_wildcard_bind_address_is_refused(self):
        for bind in ("0.0.0.0", "::", "", "localhost"):
            with self.assertRaises(m.ConfigError, msg=bind):
                m.parse_config(config(bind=bind))

    def test_an_empty_or_malformed_allow_list_is_refused(self):
        for allow in ([], None, ["not-an-ip"], "127.0.0.1"):
            with self.assertRaises(m.ConfigError, msg=repr(allow)):
                m.parse_config(config(allow=allow))

    def test_polling_faster_than_every_five_seconds_is_refused(self):
        with self.assertRaises(m.ConfigError):
            m.parse_config(config(interval_seconds=4.9))
        self.assertEqual(m.parse_config(config(interval_seconds=5)).interval_seconds, 5.0)

    def test_port_process_name_and_gpu_index_are_validated(self):
        for bad in ({"port": 0}, {"port": "8099"}, {"port": True}, {"process_name": "a/b"}, {"process_name": "x" * 16}, {"gpu_index": -1}):
            with self.assertRaises(m.ConfigError, msg=repr(bad)):
                m.parse_config(config(**bad))

    def test_a_valid_config_keeps_its_values(self):
        parsed = m.parse_config(config(allow=["127.0.0.1", "192.0.2.16"], process_name="hqplayerd", gpu_index=0))
        self.assertEqual(parsed.bind, "127.0.0.1")
        self.assertEqual(parsed.port, 8099)
        self.assertEqual(parsed.allow, frozenset({"127.0.0.1", "192.0.2.16"}))
        self.assertEqual(parsed.process_name, "hqplayerd")


class FakeNvmlLib:
    def __init__(self, failing=()):
        self.calls = []
        self.failing = set(failing)

    def _ok(self, name):
        self.calls.append(name)
        return 999 if name in self.failing else 0

    def nvmlInit_v2(self):
        return self._ok("nvmlInit_v2")

    def nvmlShutdown(self):
        return self._ok("nvmlShutdown")

    def nvmlDeviceGetHandleByIndex_v2(self, index, handle):
        handle._obj.value = 1234
        return self._ok("nvmlDeviceGetHandleByIndex_v2")

    def nvmlDeviceGetName(self, handle, buffer, size):
        buffer.value = b"Test GPU 4070"
        return self._ok("nvmlDeviceGetName")

    def nvmlDeviceGetTemperature(self, handle, sensor, out):
        out._obj.value = 41
        return self._ok("nvmlDeviceGetTemperature")

    def nvmlDeviceGetUtilizationRates(self, handle, out):
        out._obj.gpu, out._obj.memory = 32, 1
        return self._ok("nvmlDeviceGetUtilizationRates")

    def nvmlDeviceGetPowerUsage(self, handle, out):
        out._obj.value = 30010
        return self._ok("nvmlDeviceGetPowerUsage")

    def nvmlDeviceGetEnforcedPowerLimit(self, handle, out):
        out._obj.value = 200000
        return self._ok("nvmlDeviceGetEnforcedPowerLimit")

    def nvmlDeviceGetFanSpeed(self, handle, out):
        out._obj.value = 30
        return self._ok("nvmlDeviceGetFanSpeed")

    def nvmlDeviceGetClockInfo(self, handle, kind, out):
        out._obj.value = 2475
        return self._ok("nvmlDeviceGetClockInfo")

    def nvmlDeviceGetMemoryInfo(self, handle, out):
        out._obj.total, out._obj.free, out._obj.used = 12282 * 1048576, 11911 * 1048576, 371 * 1048576
        return self._ok("nvmlDeviceGetMemoryInfo")

    def nvmlDeviceGetComputeRunningProcesses_v3(self, handle, count, processes):
        processes[0].pid, processes[0].usedGpuMemory = 984, 362 * 1048576
        count._obj.value = 1
        return self._ok("nvmlDeviceGetComputeRunningProcesses_v3")


class NvmlTests(unittest.TestCase):
    def test_nvml_readings_are_converted_to_watts_and_mebibytes(self):
        nvml = m.Nvml(lib=FakeNvmlLib())
        self.assertEqual(nvml.read(), {"name": "Test GPU 4070", "temperatureC": 41, "usagePercent": 32, "powerW": 30.0,
                                       "powerLimitW": 200.0, "fanPercent": 30, "clockMhz": 2475,
                                       "memoryUsedMiB": 371, "memoryTotalMiB": 12282})

    def test_a_reading_nvml_refuses_is_unknown_not_zero(self):
        nvml = m.Nvml(lib=FakeNvmlLib(failing={"nvmlDeviceGetTemperature", "nvmlDeviceGetFanSpeed", "nvmlDeviceGetMemoryInfo"}))
        reading = nvml.read()
        self.assertIsNone(reading["temperatureC"])
        self.assertIsNone(reading["fanPercent"])
        self.assertIsNone(reading["memoryUsedMiB"])
        self.assertEqual(reading["usagePercent"], 32)

    def test_the_process_gpu_memory_is_found_by_pid(self):
        nvml = m.Nvml(lib=FakeNvmlLib())
        self.assertEqual(nvml.process_memory_mib(984), 362)
        self.assertEqual(nvml.process_memory_mib(1), 0)
        self.assertIsNone(m.Nvml(lib=FakeNvmlLib(failing={"nvmlDeviceGetComputeRunningProcesses_v3"})).process_memory_mib(984))

    def test_nvml_is_initialised_once_and_a_missing_gpu_is_an_error(self):
        lib = FakeNvmlLib()
        m.Nvml(lib=lib).read()
        self.assertEqual(lib.calls.count("nvmlInit_v2"), 1)
        failing = FakeNvmlLib(failing={"nvmlDeviceGetHandleByIndex_v2"})
        with self.assertRaises(m.NvmlError):
            m.Nvml(lib=failing)
        self.assertIn("nvmlShutdown", failing.calls)


class FakeProc:
    def __init__(self):
        self.root = tempfile.TemporaryDirectory()

    def add(self, pid, comm, utime=0, stime=0, rss_kb=951956, threads=143):
        folder = os.path.join(self.root.name, str(pid))
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "comm"), "w") as handle:
            handle.write(comm + "\n")
        fields = ["S"] + ["0"] * 10 + [str(utime), str(stime)] + ["0"] * 30
        with open(os.path.join(folder, "stat"), "w") as handle:
            handle.write(f"{pid} ({comm} with ) parens) " + " ".join(fields))
        with open(os.path.join(folder, "status"), "w") as handle:
            handle.write(f"Name:\t{comm}\nVmRSS:\t{rss_kb} kB\nThreads:\t{threads}\n")

    def remove(self, pid):
        folder = os.path.join(self.root.name, str(pid))
        for leaf in os.listdir(folder):
            os.remove(os.path.join(folder, leaf))
        os.rmdir(folder)


class ProcessReaderTests(unittest.TestCase):
    def test_cpu_use_is_cores_busy_between_two_samples(self):
        proc, now = FakeProc(), [100.0]
        proc.add(42, "bash")
        proc.add(984, "hqplayerd", utime=1000, stime=200)
        reader = m.ProcessReader("hqplayerd", proc_root=proc.root.name, clock=lambda: now[0], ticks_per_second=100)
        first = reader.read()
        self.assertEqual((first["running"], first["pid"], first["cpuCores"], first["rssMiB"], first["threads"]), (True, 984, None, 929, 143))
        proc.add(984, "hqplayerd", utime=1500, stime=390)
        now[0] = 105.0
        self.assertEqual(reader.read()["cpuCores"], 1.38)

    def test_a_missing_process_reads_as_not_running_with_unknown_values(self):
        proc = FakeProc()
        reader = m.ProcessReader("hqplayerd", proc_root=proc.root.name, ticks_per_second=100)
        self.assertEqual(reader.read(), {"running": False, "pid": None, "cpuCores": None, "rssMiB": None, "threads": None})

    def test_a_restarted_process_is_found_again_and_its_cpu_baseline_resets(self):
        proc, now = FakeProc(), [0.0]
        proc.add(984, "hqplayerd", utime=1000)
        reader = m.ProcessReader("hqplayerd", proc_root=proc.root.name, clock=lambda: now[0], ticks_per_second=100)
        reader.read()
        proc.remove(984)
        proc.add(1200, "hqplayerd", utime=5)
        now[0] = 5.0
        second = reader.read()
        self.assertEqual((second["pid"], second["cpuCores"]), (1200, None))


class StubNvml:
    def __init__(self):
        self.reads = 0

    def read(self):
        self.reads += 1
        return {"name": "Test GPU", "temperatureC": 41, "usagePercent": 32, "powerW": 30.0, "powerLimitW": 200.0,
                "fanPercent": 30, "clockMhz": 2475, "memoryUsedMiB": 371, "memoryTotalMiB": 12282}

    def process_memory_mib(self, pid):
        return 362


class StubProcesses:
    name = "hqplayerd"

    def read(self):
        return {"running": True, "pid": 984, "cpuCores": 1.38, "rssMiB": 929, "threads": 143}


class ServerTests(unittest.TestCase):
    def start(self, allow=("127.0.0.1",), sample=True):
        self.nvml, now = StubNvml(), [50.0]
        self.monitor = m.Monitor(self.nvml, StubProcesses(), 5.0, clock=lambda: now[0])
        self.now = now
        if sample:
            self.monitor.sample()
        cfg = m.Config("127.0.0.1", 0, frozenset(allow), 5.0, "hqplayerd", 0)
        self.server = m.serve(cfg, self.monitor)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def get(self, path, method="GET"):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=5)
        connection.request(method, path)
        response = connection.getresponse()
        body = response.read()
        connection.close()
        return response.status, (json.loads(body) if body else None), response

    def test_requests_are_served_from_the_last_sample_and_never_touch_the_gpu(self):
        self.start()
        for _ in range(25):
            self.assertEqual(self.get("/api/gpu")[0], 200)
            self.assertEqual(self.get("/api/process")[0], 200)
        self.assertEqual(self.nvml.reads, 1)

    def test_the_gpu_endpoint_speaks_the_pc_monitor_shape(self):
        self.start()
        status, body, response = self.get("/api/gpu")
        self.assertEqual(status, 200)
        self.assertEqual({k: body[k] for k in ("source", "name", "temperatureC", "hotspotTemperatureC", "usagePercent", "powerW", "fanRpm", "fanPercent")},
                         {"source": "nvml", "name": "Test GPU", "temperatureC": 41, "hotspotTemperatureC": None, "usagePercent": 32,
                          "powerW": 30.0, "fanRpm": None, "fanPercent": 30})
        self.assertEqual(response.getheader("Cache-Control"), "no-store")

    def test_the_process_endpoint_returns_only_its_fixed_fields(self):
        self.start()
        status, body, _ = self.get("/api/process")
        self.assertEqual(status, 200)
        self.assertEqual(set(body), {"name", "running", "cpuCores", "rssMiB", "threads", "gpuMemoryMiB", "updatedAt"})
        self.assertEqual((body["name"], body["cpuCores"], body["gpuMemoryMiB"]), ("hqplayerd", 1.38, 362))

    def test_a_client_outside_the_allow_list_gets_a_bare_403(self):
        self.start(allow=("192.0.2.16",))
        for path in ("/api/gpu", "/api/process", "/api/health", "/anything"):
            status, body, _ = self.get(path)
            self.assertEqual((status, body), (403, None), path)
        self.assertEqual(self.get("/api/gpu", method="POST")[:2], (403, None))

    def test_unknown_paths_404_and_writes_are_refused(self):
        self.start()
        self.assertEqual(self.get("/api/processes")[0], 404)
        self.assertEqual(self.get("/proc/self/environ")[0], 404)
        for method in ("POST", "PUT", "DELETE"):
            self.assertEqual(self.get("/api/gpu", method=method)[0], 405, method)

    def test_before_the_first_sample_and_when_samples_go_stale_it_says_so(self):
        self.start(sample=False)
        self.assertEqual(self.get("/api/gpu")[0], 503)
        self.assertEqual(self.get("/api/health")[1]["ok"], False)
        self.monitor.sample()
        self.assertEqual(self.get("/api/health")[:2], (200, {"ok": True, "sampleAgeSeconds": 0.0, "gpu": True, "process": True}))
        self.now[0] += 16
        self.assertEqual(self.get("/api/health")[0], 503)

    def test_a_gpu_read_failure_gives_503_not_zeros(self):
        self.start(sample=False)
        self.nvml.read = lambda: (_ for _ in ()).throw(RuntimeError("driver gone"))
        self.monitor.sample()
        self.assertEqual(self.get("/api/gpu")[0], 503)
        self.assertEqual(self.get("/api/process")[0], 200)


class SourceTests(unittest.TestCase):
    def test_the_agent_never_starts_nvidia_smi(self):
        with open(m.__file__, encoding="utf-8") as handle:
            source = handle.read()
        self.assertNotIn("nvidia-smi", source)
        self.assertNotIn("subprocess", source)


if __name__ == "__main__":
    unittest.main()
