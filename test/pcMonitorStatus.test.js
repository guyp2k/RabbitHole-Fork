"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPcMonitorStatus } = require("../src/pcMonitorStatus");

test("PC monitor normalizers trim text and round numeric values", () => {
  const monitor = createPcMonitorStatus({
    config: { pcMonitor: { enabled: true, baseUrl: "http://pc.local", timeoutMs: 1000 } },
    fetchJsonWithTimeout: async () => ({ response: { ok: true }, body: {} })
  });

  assert.deepEqual(monitor.normalizePcCpu({
    source: "  Open   Hardware  ",
    name: "  Ryzen  ",
    temperatureC: "49.8",
    usagePercent: "12.4",
    clockMhz: "5100.6",
    packagePowerW: "88.66",
    fanRpm: "1500.2"
  }), {
    source: "Open Hardware",
    name: "Ryzen",
    temperatureC: 50,
    usagePercent: 12,
    clockMhz: 5101,
    packagePowerW: 88.7,
    fanRpm: 1500
  });

  assert.deepEqual(monitor.normalizePcGpu({
    source: "  GPU-Z ",
    name: " RTX ",
    temperatureC: "52.2",
    hotspotTemperatureC: "64.8",
    usagePercent: "91.2",
    powerW: "242.27",
    fanRpm: "1800.9",
    fanPercent: "55.5"
  }), {
    source: "GPU-Z",
    name: "RTX",
    temperatureC: 52,
    hotspotTemperatureC: 65,
    usagePercent: 91,
    powerW: 242.3,
    fanRpm: 1801,
    fanPercent: 56
  });
});

test("PC monitor snapshot reports disabled state without fetching", async () => {
  let fetched = false;
  const monitor = createPcMonitorStatus({
    config: { pcMonitor: { enabled: false, baseUrl: "http://pc.local", timeoutMs: 1000 } },
    fetchJsonWithTimeout: async () => {
      fetched = true;
      return { response: { ok: true }, body: {} };
    }
  });

  const snapshot = await monitor.pcMonitorSnapshot();

  assert.equal(fetched, false);
  assert.equal(snapshot.enabled, false, "the UI hides the temperature chips from this, not from the error text");
  assert.equal(snapshot.connected, false);
  assert.equal(snapshot.cpu, null);
  assert.equal(snapshot.gpu, null);
  assert.equal(snapshot.error, "PC monitor disabled");
});

test("PC monitor snapshot keeps partial data and reports failed endpoint", async () => {
  const monitor = createPcMonitorStatus({
    config: { pcMonitor: { enabled: true, baseUrl: "http://pc.local/base/", timeoutMs: 100 } },
    fetchJsonWithTimeout: async (url) => {
      if (url === "http://pc.local/api/cpu") {
        return {
          response: { ok: true },
          body: { source: "cpu", name: "Ryzen", temperatureC: "45" }
        };
      }
      return { response: { ok: false, status: 503 }, body: {} };
    }
  });

  const snapshot = await monitor.pcMonitorSnapshot();

  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.cpu.name, "Ryzen");
  assert.equal(snapshot.gpu, null);
  assert.equal(snapshot.error, "GPU HTTP 503");
});

test("Roon's player shows the CPU and GPU chips only while the PC monitor is enabled", () => {
  const fs = require("node:fs"), vm = require("node:vm");
  const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  const fn = name => { const start = app.indexOf(`function ${name}(`); assert.ok(start >= 0, name); return app.slice(start, app.indexOf("\n}\n", start) + 3); };
  const node = () => ({ hidden: false, textContent: "", title: "", classList: { set: new Set(), contains(n) { return this.set.has(n); }, toggle(n, on) { on ? this.set.add(n) : this.set.delete(n); } } });
  const chips = [node(), node()], overlay = { ...node(), querySelector: s => s.endsWith("Cpu") ? chips[0] : chips[1], querySelectorAll: () => chips };
  const player = node(); player.classList.set.add("player--regular");
  const view = node(); view.classList.set.add("isActive");
  const nodes = { "#pcTempOverlay": overlay, "#pcTempCpu": node(), "#pcTempGpu": node(), "#playerView": view };
  const context = { $: s => nodes[s], document: { querySelector: s => s === ".player" ? player : null }, playerFullscreenElement: () => null };
  vm.runInNewContext(["pcMonitorTempText", "pcMonitorShowsTemps", "setPcTempChipState", "renderPcMonitorOverlay"].map(fn).join("\n"), context);
  const shown = snapshot => { context.renderPcMonitorOverlay(snapshot, snapshot?.error || ""); return chips.map(c => !c.hidden); };
  assert.deepEqual(shown({ enabled: false, connected: false, cpu: null, gpu: null, error: "PC monitor disabled" }), [false, false]);
  assert.deepEqual(shown(null), [false, false], "before the first answer nothing claims a reading");
  assert.deepEqual(shown({ enabled: true, connected: true, cpu: { temperatureC: 52 }, gpu: { temperatureC: 46 }, error: "" }), [true, true]);
  assert.equal(nodes["#pcTempCpu"].textContent, "52C");
  assert.deepEqual(shown({ enabled: true, connected: false, cpu: null, gpu: null, error: "CPU HTTP 503" }), [true, true], "a configured monitor that stopped answering still shows, as offline");
  assert.equal(overlay.hidden, false, "the overlay stays: it also holds the connection status list");
  const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
  assert.match(css, /\n\.pcTempChip\[hidden\],\n\.soundSpectrumStage \.lyrionCenterViews\[hidden\] \{\n  display: none !important;\n\}\n/);
});
