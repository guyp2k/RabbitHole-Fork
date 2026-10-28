"use strict";
const net = require("node:net");

const HQPLAYER_CONTROL_PORT = 4321;

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value.replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")]));
}

function parseHqplayerStatus(xml) {
  const status = String(xml).match(/<Status\b([^>]*?)\/?>/);
  if (!status) return null;
  const a = attributes(status[1]);
  const metadata = String(xml).match(/<metadata\b([^>]*?)\/?>/);
  const m = metadata ? attributes(metadata[1]) : null;
  const number = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const known = value => (value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null);
  return { state: number(a.state), mode: a.active_mode || "", rate: number(a.active_rate), bits: number(a.active_bits),
    filter: a.active_filter || "", shaper: a.active_shaper || "", speed: number(a.process_speed), clips: known(a.clips),
    source: m ? { rate: number(m.samplerate), bits: number(m.bits), mime: m.mime || "" } : null };
}

function parseHqpHostMonitors(text = "") {
  const monitors = new Map();
  for (const entry of String(text).split(",")) {
    const at = entry.indexOf("=");
    if (at < 1) continue;
    const host = entry.slice(0, at).trim();
    let url;
    try { url = new URL(entry.slice(at + 1).trim()); } catch { continue; }
    if (host && /^https?:$/.test(url.protocol) && !url.username && !url.password) monitors.set(host, url.origin);
  }
  return monitors;
}

async function fetchMonitorJson(url, timeoutMs) {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function hostStats(gpu, processStats) {
  const value = number => (typeof number === "number" && Number.isFinite(number) ? number : null);
  return {
    available: true,
    gpu: { temperatureC: value(gpu?.temperatureC), usagePercent: value(gpu?.usagePercent), powerW: value(gpu?.powerW),
      memoryUsedMiB: value(gpu?.memoryUsedMiB), memoryTotalMiB: value(gpu?.memoryTotalMiB) },
    process: processStats?.running === true ? { cpuCores: value(processStats.cpuCores), gpuMemoryMiB: value(processStats.gpuMemoryMiB) } : null
  };
}

function createHqplayerControl({ connect = options => net.createConnection(options), clock = Date.now, timeoutMs = 1500, cacheMs = 2500,
  hostMonitors = parseHqpHostMonitors(process.env.HQP_HOST_MONITORS), fetchJson = fetchMonitorJson, monitorTimeoutMs = 1200 } = {}) {
  const cache = new Map();
  async function monitorStats(name) {
    const base = hostMonitors.get(name);
    if (!base) return null;
    try {
      const [gpu, processStats] = await Promise.all([fetchJson(`${base}/api/gpu`, monitorTimeoutMs), fetchJson(`${base}/api/process`, monitorTimeoutMs).catch(() => null)]);
      return hostStats(gpu, processStats);
    } catch {
      return { available: false, gpu: null, process: null };
    }
  }
  function query(host) {
    return new Promise(resolve => {
      let reply = "", settled = false;
      const socket = connect({ host, port: HQPLAYER_CONTROL_PORT });
      const finish = value => { if (settled) return; settled = true; socket.destroy(); resolve(value); };
      socket.setTimeout(timeoutMs, () => finish(null));
      socket.on("error", () => finish(null));
      socket.on("close", () => finish(parseHqplayerStatus(reply)));
      socket.on("connect", () => socket.write('<?xml version="1.0" encoding="UTF-8"?><Status subscribe="0" />\n'));
      socket.on("data", chunk => {
        reply += chunk.toString("utf8");
        if (/<\/Status>|<Status\b[^>]*\/>/.test(reply) || reply.length > 65536) finish(parseHqplayerStatus(reply));
      });
    });
  }
  return {
    async status(host) {
      const cached = cache.get(host);
      if (cached && clock() - cached.at < cacheMs) return cached.value;
      const [status, stats] = await Promise.all([query(host), monitorStats(host)]);
      const value = status && hostMonitors.has(host) ? { ...status, host: stats } : status;
      cache.set(host, { at: clock(), value });
      if (cache.size > 20) cache.delete(cache.keys().next().value);
      return value;
    }
  };
}

module.exports = { parseHqplayerStatus, parseHqpHostMonitors, createHqplayerControl, HQPLAYER_CONTROL_PORT };
