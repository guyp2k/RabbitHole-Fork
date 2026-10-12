"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const SAMPLE_RATE = 2000;
const BUCKETS = 240;

function peaksFromSamples(samples, buckets = BUCKETS) {
  if (!samples.length) return null;
  const size = samples.length / buckets, levels = [];
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size), to = Math.max(from + 1, Math.floor((b + 1) * size));
    let sum = 0;
    for (let i = from; i < to && i < samples.length; i++) sum += samples[i] * samples[i];
    levels.push(Math.sqrt(sum / (to - from)));
  }
  const loudest = Math.max(...levels);
  if (!(loudest > 0)) return null;
  return levels.map(level => Math.round((level / loudest) * 1000) / 1000);
}

function createWaveformPeaks({ ffmpegPath = "ffmpeg", lmsBaseUrl, cacheDir = "", spawnImpl = spawn, timeoutMs = 180000, logger = null } = {}) {
  const memory = new Map(), pending = new Map();
  let unavailable = false, queue = Promise.resolve();
  const fileFor = id => cacheDir ? path.join(cacheDir, `lms-${id}.json`) : "";

  function decode(id) {
    return new Promise(resolve => {
      const url = `${new URL(lmsBaseUrl).origin}/music/${id}/download`;
      let child;
      try { child = spawnImpl(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", url, "-vn", "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "s16le", "pipe:1"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }); }
      catch (error) { unavailable = true; logger?.warn?.("Waveform decoder unavailable", { error: error.message }); return resolve(null); }
      const chunks = [];
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.stdout.on("data", chunk => chunks.push(chunk));
      child.stderr?.on("data", () => {});
      child.on("error", error => { clearTimeout(timer); if (error.code === "ENOENT") unavailable = true; logger?.warn?.("Waveform decode failed", { error: error.message }); resolve(null); });
      child.on("close", code => {
        clearTimeout(timer);
        if (code !== 0) return resolve(null);
        const bytes = Buffer.concat(chunks), samples = new Float32Array(Math.floor(bytes.length / 2));
        for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(i * 2) / 32768;
        resolve(peaksFromSamples(samples));
      });
    });
  }

  async function forLmsTrack(trackId) {
    const id = String(trackId || "");
    if (!/^\d{1,12}$/.test(id)) return { peaks: null, reason: "Only library files have a waveform." };
    if (memory.has(id)) return { peaks: memory.get(id) };
    const file = fileFor(id);
    if (file) {
      try { const stored = JSON.parse(fs.readFileSync(file, "utf8")); if (Array.isArray(stored.peaks)) { memory.set(id, stored.peaks); return { peaks: stored.peaks }; } } catch {}
    }
    if (unavailable) return { peaks: null, reason: "No audio decoder is installed." };
    if (!pending.has(id)) {
      const work = (queue = queue.then(() => decode(id))).then(peaks => {
        if (peaks) {
          memory.set(id, peaks);
          if (memory.size > 300) memory.delete(memory.keys().next().value);
          if (file) { try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ peaks })); } catch (error) { logger?.warn?.("Waveform cache write failed", { error: error.message }); } }
        }
        return peaks;
      }).finally(() => pending.delete(id));
      pending.set(id, work);
    }
    const peaks = await pending.get(id);
    return peaks ? { peaks } : { peaks: null, reason: unavailable ? "No audio decoder is installed." : "The file could not be decoded." };
  }

  return { forLmsTrack };
}

module.exports = { createWaveformPeaks, peaksFromSamples, BUCKETS };
