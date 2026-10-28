#!/usr/bin/env python3
import argparse
import ctypes
import ipaddress
import json
import os
import signal
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

MIN_INTERVAL_SECONDS = 5.0
NVML_SUCCESS = 0
NVML_TEMPERATURE_GPU = 0
NVML_CLOCK_GRAPHICS = 0
MAX_GPU_PROCESSES = 64


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class Config:
    bind: str
    port: int
    allow: frozenset
    interval_seconds: float
    process_name: str
    gpu_index: int


def _address(value, field):
    try:
        return ipaddress.ip_address(str(value))
    except ValueError:
        raise ConfigError(f"{field} must be an IP address, got {value!r}") from None


def parse_config(raw):
    if not isinstance(raw, dict):
        raise ConfigError("config must be a JSON object")
    bind = _address(raw.get("bind", ""), "bind")
    if bind.is_unspecified:
        raise ConfigError("bind must be one address of this host, not a wildcard")
    port = raw.get("port")
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        raise ConfigError("port must be an integer from 1 to 65535")
    allow = raw.get("allow")
    if not isinstance(allow, list) or not allow:
        raise ConfigError("allow must list at least one client address")
    allowed = frozenset(str(_address(item, "allow")) for item in allow)
    interval = raw.get("interval_seconds", MIN_INTERVAL_SECONDS)
    if not isinstance(interval, (int, float)) or isinstance(interval, bool) or interval < MIN_INTERVAL_SECONDS:
        raise ConfigError(f"interval_seconds must be a number of at least {MIN_INTERVAL_SECONDS:g}")
    process_name = raw.get("process_name", "hqplayerd")
    if not isinstance(process_name, str) or not 0 < len(process_name) <= 15 or "/" in process_name:
        raise ConfigError("process_name must be a process name of 1 to 15 characters")
    gpu_index = raw.get("gpu_index", 0)
    if not isinstance(gpu_index, int) or isinstance(gpu_index, bool) or gpu_index < 0:
        raise ConfigError("gpu_index must be a non-negative integer")
    return Config(str(bind), port, allowed, float(interval), process_name, gpu_index)


def load_config(path):
    with open(path, encoding="utf-8") as handle:
        return parse_config(json.load(handle))


class _Utilization(ctypes.Structure):
    _fields_ = [("gpu", ctypes.c_uint), ("memory", ctypes.c_uint)]


class _Memory(ctypes.Structure):
    _fields_ = [("total", ctypes.c_ulonglong), ("free", ctypes.c_ulonglong), ("used", ctypes.c_ulonglong)]


class _GpuProcess(ctypes.Structure):
    _fields_ = [
        ("pid", ctypes.c_uint),
        ("usedGpuMemory", ctypes.c_ulonglong),
        ("gpuInstanceId", ctypes.c_uint),
        ("computeInstanceId", ctypes.c_uint),
    ]


class NvmlError(RuntimeError):
    pass


class Nvml:
    def __init__(self, gpu_index=0, lib=None):
        self.lib = lib if lib is not None else ctypes.CDLL("libnvidia-ml.so.1")
        if self.lib.nvmlInit_v2() != NVML_SUCCESS:
            raise NvmlError("NVML did not initialise")
        self.handle = ctypes.c_void_p()
        if self.lib.nvmlDeviceGetHandleByIndex_v2(gpu_index, ctypes.byref(self.handle)) != NVML_SUCCESS:
            self.lib.nvmlShutdown()
            raise NvmlError(f"NVML has no GPU at index {gpu_index}")
        name = ctypes.create_string_buffer(96)
        self.name = name.value.decode("utf-8", "replace") if self.lib.nvmlDeviceGetName(self.handle, name, 96) == NVML_SUCCESS else ""

    def _uint(self, function, *args):
        value = ctypes.c_uint()
        return value.value if getattr(self.lib, function)(self.handle, *args, ctypes.byref(value)) == NVML_SUCCESS else None

    def read(self):
        utilization = _Utilization()
        utilization_ok = self.lib.nvmlDeviceGetUtilizationRates(self.handle, ctypes.byref(utilization)) == NVML_SUCCESS
        memory = _Memory()
        memory_ok = self.lib.nvmlDeviceGetMemoryInfo(self.handle, ctypes.byref(memory)) == NVML_SUCCESS
        power = self._uint("nvmlDeviceGetPowerUsage")
        limit = self._uint("nvmlDeviceGetEnforcedPowerLimit")
        return {
            "name": self.name,
            "temperatureC": self._uint("nvmlDeviceGetTemperature", NVML_TEMPERATURE_GPU),
            "usagePercent": utilization.gpu if utilization_ok else None,
            "powerW": round(power / 1000, 1) if power is not None else None,
            "powerLimitW": round(limit / 1000, 1) if limit is not None else None,
            "fanPercent": self._uint("nvmlDeviceGetFanSpeed"),
            "clockMhz": self._uint("nvmlDeviceGetClockInfo", NVML_CLOCK_GRAPHICS),
            "memoryUsedMiB": memory.used // 1048576 if memory_ok else None,
            "memoryTotalMiB": memory.total // 1048576 if memory_ok else None,
        }

    def process_memory_mib(self, pid):
        count = ctypes.c_uint(MAX_GPU_PROCESSES)
        processes = (_GpuProcess * MAX_GPU_PROCESSES)()
        if self.lib.nvmlDeviceGetComputeRunningProcesses_v3(self.handle, ctypes.byref(count), processes) != NVML_SUCCESS:
            return None
        for process in processes[: count.value]:
            if process.pid == pid:
                return process.usedGpuMemory // 1048576
        return 0

    def close(self):
        self.lib.nvmlShutdown()


class ProcessReader:
    def __init__(self, name, proc_root="/proc", clock=time.monotonic, ticks_per_second=None):
        self.name = name
        self.proc_root = proc_root
        self.clock = clock
        self.ticks = ticks_per_second or os.sysconf("SC_CLK_TCK")
        self.pid = None
        self.last = None

    def _read(self, pid, leaf):
        with open(os.path.join(self.proc_root, str(pid), leaf), encoding="utf-8") as handle:
            return handle.read()

    def _is_ours(self, pid):
        try:
            return self._read(pid, "comm").strip() == self.name
        except OSError:
            return False

    def _find(self):
        if self.pid is not None and self._is_ours(self.pid):
            return self.pid
        self.pid, self.last = None, None
        for entry in sorted(os.listdir(self.proc_root)):
            if entry.isdigit() and self._is_ours(int(entry)):
                self.pid = int(entry)
                return self.pid
        return None

    def read(self):
        pid = self._find()
        if pid is None:
            return {"running": False, "pid": None, "cpuCores": None, "rssMiB": None, "threads": None}
        try:
            fields = self._read(pid, "stat").rsplit(")", 1)[1].split()
            status = dict(line.split(":", 1) for line in self._read(pid, "status").splitlines() if ":" in line)
        except OSError:
            self.pid, self.last = None, None
            return {"running": False, "pid": None, "cpuCores": None, "rssMiB": None, "threads": None}
        busy = int(fields[11]) + int(fields[12])
        now = self.clock()
        cores = None
        if self.last is not None and now > self.last[1]:
            cores = round((busy - self.last[0]) / self.ticks / (now - self.last[1]), 2)
        self.last = (busy, now)
        rss = status.get("VmRSS", "").split()
        threads = status.get("Threads", "").strip()
        return {
            "running": True,
            "pid": pid,
            "cpuCores": cores,
            "rssMiB": int(rss[0]) // 1024 if rss and rss[0].isdigit() else None,
            "threads": int(threads) if threads.isdigit() else None,
        }


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Monitor:
    def __init__(self, nvml, processes, interval_seconds, clock=time.monotonic):
        self.nvml = nvml
        self.processes = processes
        self.interval = interval_seconds
        self.clock = clock
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        self.snapshot = None
        self.sampled_at = None

    def sample(self):
        try:
            gpu = self.nvml.read()
        except Exception:
            gpu = None
        process = self.processes.read()
        gpu_memory = None
        if process["running"]:
            try:
                gpu_memory = self.nvml.process_memory_mib(process["pid"])
            except Exception:
                gpu_memory = None
        updated = _now()
        snapshot = {
            "gpu": None if gpu is None else {"source": "nvml", **gpu, "hotspotTemperatureC": None, "fanRpm": None, "updatedAt": updated},
            "process": {"name": self.processes.name, "running": process["running"], "cpuCores": process["cpuCores"],
                        "rssMiB": process["rssMiB"], "threads": process["threads"], "gpuMemoryMiB": gpu_memory, "updatedAt": updated},
        }
        with self.lock:
            self.snapshot = snapshot
            self.sampled_at = self.clock()

    def current(self):
        with self.lock:
            return self.snapshot, self.sampled_at

    def run(self):
        self.sample()
        while not self.stop_event.wait(self.interval):
            self.sample()

    def start(self):
        thread = threading.Thread(target=self.run, name="sampler", daemon=True)
        thread.start()
        return thread

    def stop(self):
        self.stop_event.set()


def make_handler(monitor, allowed):
    class Handler(BaseHTTPRequestHandler):
        server_version = "hqp-host-monitor"
        sys_version = ""

        def log_message(self, *args):
            pass

        def _client_allowed(self):
            address = ipaddress.ip_address(self.client_address[0])
            if getattr(address, "ipv4_mapped", None):
                address = address.ipv4_mapped
            return str(address) in allowed

        def _send(self, status, body=None):
            data = b"" if body is None else json.dumps(body).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if data:
                self.wfile.write(data)

        def do_GET(self):
            if not self._client_allowed():
                return self._send(403)
            path = urlsplit(self.path).path
            snapshot, sampled_at = monitor.current()
            if path == "/api/health":
                age = None if sampled_at is None else round(monitor.clock() - sampled_at, 1)
                fresh = age is not None and age <= monitor.interval * 3
                return self._send(200 if fresh else 503, {"ok": fresh, "sampleAgeSeconds": age,
                                                          "gpu": bool(snapshot and snapshot["gpu"]),
                                                          "process": bool(snapshot and snapshot["process"]["running"])})
            if path not in ("/api/gpu", "/api/process"):
                return self._send(404)
            if snapshot is None:
                return self._send(503)
            part = snapshot["gpu" if path == "/api/gpu" else "process"]
            return self._send(200, part) if part is not None else self._send(503)

        def _refuse(self):
            return self._send(405 if self._client_allowed() else 403)

        do_POST = do_PUT = do_PATCH = do_DELETE = do_HEAD = do_OPTIONS = _refuse

    return Handler


def serve(config, monitor):
    server = ThreadingHTTPServer((config.bind, config.port), make_handler(monitor, config.allow))
    server.daemon_threads = True
    return server


def main(argv=None):
    parser = argparse.ArgumentParser(description="Read-only GPU and process stats for one HQPlayer host.")
    parser.add_argument("--config", required=True)
    args = parser.parse_args(argv)
    config = load_config(args.config)
    nvml = Nvml(config.gpu_index)
    monitor = Monitor(nvml, ProcessReader(config.process_name), config.interval_seconds)
    server = serve(config, monitor)

    def shutdown(*_):
        monitor.stop()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    monitor.start()
    try:
        server.serve_forever()
    finally:
        server.server_close()
        nvml.close()


if __name__ == "__main__":
    main()
