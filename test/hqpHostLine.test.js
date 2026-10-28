"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { parseHqplayerStatus, parseHqpHostMonitors, createHqplayerControl } = require("../src/hqplayerControl");

const read = (file) => fs.readFileSync(require.resolve(`../${file}`), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const status = (attrs) => `<?xml version="1.0" encoding="utf-8"?><Status active_bits="1" active_filter="poly-sinc-gauss-xla" active_mode="SDM (DSD)" active_rate="22579200" active_shaper="ASDM7ECv3" ${attrs}/>`;
const PLAYING = status('process_speed="1.42" state="2" clips="0"');

function hqp(xml) {
  return () => {
    const socket = new EventEmitter();
    socket.setTimeout = () => {};
    socket.destroy = () => {};
    socket.write = () => setImmediate(() => { if (xml === null) socket.emit("error", new Error("refused")); else socket.emit("data", Buffer.from(xml)); });
    setImmediate(() => socket.emit("connect"));
    return socket;
  };
}

const GPU = { source: "nvml", name: "Test GPU", temperatureC: 41, usagePercent: 32, powerW: 30.1, powerLimitW: 200, fanPercent: 30, clockMhz: 2475, memoryUsedMiB: 371, memoryTotalMiB: 12282, extra: "dropped" };
const PROCESS = { name: "hqplayerd", running: true, cpuCores: 1.38, rssMiB: 929, threads: 143, gpuMemoryMiB: 362, pid: 984 };

test("HQPlayer's clip count is read, and a status without one leaves it unknown rather than 0", () => {
  assert.equal(parseHqplayerStatus(PLAYING).clips, 0);
  assert.equal(parseHqplayerStatus(status('process_speed="1.42" state="2" clips="3"')).clips, 3);
  assert.equal(parseHqplayerStatus(status('process_speed="1.42" state="2"')).clips, null);
});

test("HQP_HOST_MONITORS maps HQPlayer hosts to agent URLs and skips anything that is not a plain http(s) URL", () => {
  const monitors = parseHqpHostMonitors(" 192.0.2.30 = http://192.0.2.30:8099/ignored/path , hqp.local=https://hqp.local:8443,Bad=ftp://x,Creds=http://u:p@x:1,NoUrl=,=http://192.0.2.1:1,Junk");
  assert.deepEqual([...monitors], [["192.0.2.30", "http://192.0.2.30:8099"], ["hqp.local", "https://hqp.local:8443"]]);
  assert.equal(parseHqpHostMonitors(undefined).size, 0);
});

test("a monitored HQPlayer host gets its agent's GPU and process numbers, and only the fixed fields", async () => {
  const asked = [];
  const control = createHqplayerControl({ connect: hqp(PLAYING), hostMonitors: parseHqpHostMonitors("192.0.2.30=http://192.0.2.30:8099"),
    fetchJson: async (url) => { asked.push(url); return url.endsWith("/api/gpu") ? GPU : PROCESS; } });
  const result = await control.status("192.0.2.30");
  assert.deepEqual(asked.sort(), ["http://192.0.2.30:8099/api/gpu", "http://192.0.2.30:8099/api/process"]);
  assert.deepEqual(result.host, { available: true, gpu: { temperatureC: 41, usagePercent: 32, powerW: 30.1, memoryUsedMiB: 371, memoryTotalMiB: 12282 },
    process: { cpuCores: 1.38, gpuMemoryMiB: 362 } });
  assert.equal(result.filter, "poly-sinc-gauss-xla");
  await control.status("192.0.2.30");
  assert.equal(asked.length, 2);
});

test("an HQPlayer host whose agent does not answer is marked unavailable, never filled with zeros", async () => {
  const control = createHqplayerControl({ connect: hqp(PLAYING), hostMonitors: parseHqpHostMonitors("192.0.2.30=http://192.0.2.30:8099"),
    fetchJson: async () => { throw new Error("timeout"); } });
  assert.deepEqual((await control.status("192.0.2.30")).host, { available: false, gpu: null, process: null });
});

test("an HQPlayer host without an agent, such as another machine's HQPlayer, gets no host data and its agent is never asked", async () => {
  let asked = 0;
  const control = createHqplayerControl({ connect: hqp(PLAYING), hostMonitors: parseHqpHostMonitors("192.0.2.30=http://192.0.2.30:8099"), fetchJson: async () => { asked++; return GPU; } });
  const result = await control.status("192.0.2.99");
  assert.equal("host" in result, false);
  assert.equal(asked, 0);
});

test("an unreachable HQPlayer still reads as no HQPlayer, so no line shows at all", async () => {
  const control = createHqplayerControl({ connect: hqp(null), hostMonitors: parseHqpHostMonitors("192.0.2.30=http://192.0.2.30:8099"), fetchJson: async () => GPU });
  assert.equal(await control.status("192.0.2.30"), null);
});

function summary() {
  const context = {};
  vm.runInNewContext(read("public/hqplayerSummary.js"), context);
  return context;
}
const H = (extra = {}) => ({ ...parseHqplayerStatus(PLAYING), host: { available: true, gpu: { temperatureC: 41, usagePercent: 32, powerW: 30.1, memoryUsedMiB: 371, memoryTotalMiB: 12282 }, process: null }, ...extra });
const text = (parts) => parts.map((p) => p.text).join(" · ");

test("realtime moves to the host line when there is one, and stays in the HQPlayer line when there is not", () => {
  const s = summary();
  assert.equal(s.hqplayerSummary(H()), "DSD512 · 22.5792 MHz / 1-bit SDM · poly-sinc-gauss-xla · ASDM7ECv3");
  assert.equal(s.hqplayerSummary(parseHqplayerStatus(PLAYING)), "DSD512 · 22.5792 MHz / 1-bit SDM · poly-sinc-gauss-xla · ASDM7ECv3 · 1.4x realtime");
  assert.equal(s.hqpHostParts(parseHqplayerStatus(PLAYING)), null);
  assert.equal(s.hqpHostParts(null), null);
});

test("the host line shows realtime, GPU temperature, load, power, memory and clips, coloured by the agreed limits", () => {
  const s = summary();
  const parts = s.hqpHostParts(H());
  assert.equal(text(parts), "1.42x realtime · GPU 41°C · 32% · 30 W · 0.4 / 12 GB · 0 clips");
  assert.deepEqual(plain(parts.map((p) => p.level ?? null)), ["ok", "ok", null, null, null, "ok"]);
  const level = (extra) => s.hqpHostParts(H(extra))[0].level;
  assert.deepEqual([level({ speed: 1.1 }), level({ speed: 1.0999 }), level({ speed: 1.0 }), level({ speed: 0.98 })], ["ok", "warn", "warn", "bad"]);
  const temp = (t) => s.hqpHostParts(H({ host: { available: true, gpu: { temperatureC: t }, process: null } })).find((p) => p.text.startsWith("GPU")).level;
  assert.deepEqual([temp(79), temp(80), temp(89), temp(90)], ["ok", "warn", "warn", "bad"]);
  assert.deepEqual(plain(s.hqpHostParts(H({ clips: 3 })).at(-1)), { text: "3 clips", level: "bad" });
  assert.equal(s.hqpHostParts(H({ clips: 1 })).at(-1).text, "1 clip");
});

test("a stopped or paused HQPlayer shows no realtime, never a red 0.00x", () => {
  const s = summary();
  for (const state of [0, 1]) {
    const shown = text(s.hqpHostParts(H({ state, speed: 0 })));
    assert.doesNotMatch(shown, /realtime/);
    assert.match(shown, /^GPU 41°C/);
  }
});

test("an unreachable agent shows a muted 'no data' and HQPlayer's own numbers, and missing values are left out instead of shown as 0", () => {
  const s = summary();
  const down = s.hqpHostParts(H({ host: { available: false, gpu: null, process: null } }));
  assert.equal(text(down), "1.42x realtime · HQP host: no data · 0 clips");
  assert.equal(down[1].level, "muted");
  const partial = text(s.hqpHostParts(H({ clips: null, host: { available: true, gpu: { temperatureC: null, usagePercent: 32, powerW: null, memoryUsedMiB: 371, memoryTotalMiB: null }, process: null } })));
  assert.equal(partial, "1.42x realtime · 32%");
  assert.doesNotMatch(partial, /null|undefined|NaN/);
});

function fakeDom() {
  const make = (tag) => ({ tag, className: "", hidden: false, textContent: "", dataset: {}, children: [], nextElementSibling: null,
    after(node) { this.nextElementSibling = node; }, replaceChildren(...nodes) { this.children = nodes; } });
  return { document: { createElement: make }, make };
}

test("the host line is drawn once after the HQPlayer line, reused on refresh, and hidden when there is nothing to show", () => {
  const dom = fakeDom(), context = { document: dom.document };
  vm.runInNewContext(read("public/hqplayerSummary.js"), context);
  const signal = dom.make("p");
  context.renderHqpHost(signal, H());
  const line = signal.nextElementSibling;
  assert.deepEqual([line.className, line.hidden, line.children[0].textContent], ["hqpHostLine", false, "HQP host"]);
  assert.deepEqual(plain(line.children.slice(1).filter((c) => typeof c !== "string").map((c) => [c.textContent, c.dataset.level ?? null]).slice(0, 2)), [["1.42x realtime", "ok"], ["GPU 41°C", "ok"]]);
  context.renderHqpHost(signal, H({ speed: 0.95 }));
  assert.equal(signal.nextElementSibling, line);
  assert.equal(line.children[1].dataset.level, "bad");
  context.renderHqpHost(signal, parseHqplayerStatus(PLAYING));
  assert.deepEqual([line.hidden, line.children.length], [true, 0]);
});

test("Roon draws the host line for a zone on a monitored HQPlayer and clears it for any other zone", async () => {
  const listeners = {}, dom = fakeDom();
  const nodes = { nowPlayback: dom.make("div"), nowPlaybackChain: dom.make("p"), nowPlaybackSignal: dom.make("p") };
  const stage = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  const context = { document: { ...dom.document, hidden: false, querySelector: (s) => (s === "#playerView .player" ? stage : null), getElementById: (id) => nodes[id] },
    fetch: async (url) => ({ ok: true, json: async () => ({ hqplayer: url.includes("HQPd") ? H() : url.includes("HQP-WIN11") ? parseHqplayerStatus(PLAYING) : null }) }),
    setInterval: () => {}, encodeURIComponent };
  vm.runInNewContext(read("public/hqplayerSummary.js") + read("public/roonPlaybackStrip.js"), context);
  const emit = async (detail) => { listeners["roon-playback"]({ detail }); await new Promise((r) => setImmediate(r)); };
  await emit({ zoneName: "HQPd", state: "playing", connected: true });
  const line = nodes.nowPlaybackSignal.nextElementSibling;
  assert.equal(line.hidden, false);
  assert.match(nodes.nowPlaybackSignal.textContent, /ASDM7ECv3$/);
  await emit({ zoneName: "HQP-WIN11", state: "playing", connected: true });
  assert.equal(line.hidden, true);
  assert.match(nodes.nowPlaybackSignal.textContent, /1\.4x realtime$/);
  await emit({ zoneName: "Living Room", state: "playing", connected: true });
  assert.deepEqual([line.hidden, nodes.nowPlaybackSignal.hidden], [true, true]);
  await emit({ zoneName: "", state: "stopped", connected: true });
  assert.equal(line.hidden, true);
  await emit({ zoneName: "HQPd", state: "playing", connected: true });
  assert.equal(line.hidden, false);
  await emit({ zoneName: "Living Room", state: "playing", connected: true });
  assert.equal(line.hidden, true, "switching straight from an HQPlayer zone to a non-HQPlayer zone clears the host line");
});

test("Lyrion draws the same host line under its HQPlayer line", () => {
  assert.match(read("public/lyrion.js"), /const line=\$\("lyrionHqplayer"\),text=hqplayerSummary\(h\);\s*line\.textContent=text;line\.hidden=!text;renderHqpHost\(line,h\);/);
});
