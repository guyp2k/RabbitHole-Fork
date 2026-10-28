# HQP host monitor

A small read-only agent for the machine that runs HQPlayer Embedded on an NVIDIA GPU. It reports the GPU's temperature, load, power, clock and memory, and fixed stats for the `hqplayerd` process, so Rabbit Hole can show them under the HQPlayer line on Now Playing. HQPlayer's own numbers (realtime factor, clips) are not read here; Rabbit Hole reads those from HQPlayer's control API.

It is not part of the Rabbit Hole image. It runs on the HQPlayer host, needs only Python 3 and the NVIDIA driver, and uses no third-party packages.

## How it stays out of HQPlayer's way

- It opens NVIDIA's management library (`libnvidia-ml.so.1`) once and keeps it open. It never starts `nvidia-smi`, which would initialise the driver on every call.
- One background thread samples every 5 seconds or slower (`interval_seconds`, minimum 5). HTTP requests are answered from the last sample and never touch the GPU, however often they come.
- Process stats come from `/proc/<pid>/stat` and `/proc/<pid>/status`.
- The unit runs at `Nice=19`. It does not use `CPUSchedulingPolicy=idle`: an idle-class thread preempted inside an NVML call can hold a driver lock that HQPlayer's CUDA work then waits behind.

## Endpoints

All are `GET` only and return JSON. Anything else gets `405`, and a client not in `allow` gets a bare `403`.

| Path | Returns |
|------|---------|
| `/api/gpu` | `source`, `name`, `temperatureC`, `usagePercent`, `powerW`, `powerLimitW`, `fanPercent`, `clockMhz`, `memoryUsedMiB`, `memoryTotalMiB`, `updatedAt` (and `hotspotTemperatureC`, `fanRpm` as `null`, for the same shape as Rabbit Hole's PC monitor) |
| `/api/process` | `name`, `running`, `cpuCores`, `rssMiB`, `threads`, `gpuMemoryMiB`, `updatedAt` |
| `/api/health` | `ok`, `sampleAgeSeconds`, `gpu`, `process`; `503` when the last sample is older than three intervals |

A value the driver or the kernel does not report is `null`, never `0`. Before the first sample, or if the GPU cannot be read, `/api/gpu` answers `503`.

## Install (as your normal user, no root)

```sh
mkdir -p ~/.local/share/hqp-host-monitor ~/.config/hqp-host-monitor ~/.config/systemd/user
cp hqp_host_monitor.py ~/.local/share/hqp-host-monitor/
cp config.example.json ~/.config/hqp-host-monitor/config.json   # then edit it
cp hqp-host-monitor.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now hqp-host-monitor
```

For it to keep running after you log out, an administrator runs `sudo loginctl enable-linger <user>` once.

## Config

| Key | Meaning |
|-----|---------|
| `bind` | The one address of this host to listen on. Wildcards (`0.0.0.0`, `::`) are refused. |
| `port` | TCP port. |
| `allow` | Client addresses allowed to read it (normally only the Rabbit Hole host). |
| `interval_seconds` | Sampling interval, at least 5. |
| `process_name` | The process to report, as shown in `/proc/<pid>/comm` (default `hqplayerd`). |
| `gpu_index` | NVML index of the GPU (default `0`). |

## Tests

```sh
cd integrations/hqp-host-monitor && python3 -m unittest -v
```
