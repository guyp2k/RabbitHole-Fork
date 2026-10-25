"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const read = name => fs.readFileSync(require.resolve(`../public/${name}`), "utf8");
const app = read("app.js"), html = read("index.html"), lyrion = read("lyrion.js"), rail = read("lyrionDiscoveryRail.js"), css = read("styles.css");

function formatUpNext(stubs) {
  const start = app.indexOf("function formatUpNext(zone) {");
  assert.notEqual(start, -1);
  const source = app.slice(start, app.indexOf("\n}\n", start) + 3);
  const context = { ...stubs };
  vm.runInNewContext(`${source}\nthis.formatUpNext = formatUpNext;`, context);
  return context.formatUpNext;
}

const zone = { zone_id: "z" };
const stubs = (items, info = "12 queued - 1:14:02 left", live = false, nowTitle = "Sorrow") => ({
  formatQueueInfo: () => info, isLiveRadioZone: () => live, displayQueueItems: () => items, summarizeNowPlaying: () => ({ title: nowTitle })
});

test("Roon names the next queued track under the art, followed by the queue count and time left", () => {
  const upNext = formatUpNext(stubs([{ title: "The Piper's Call", subtitle: "David Gilmour - Live at the Circus Maximus" }]));
  assert.equal(upNext(zone), "Up next: The Piper's Call - David Gilmour · 12 queued - 1:14:02 left");
});

test("Roon does not repeat the artist when the queued title already carries it", () => {
  const upNext = formatUpNext(stubs([{ title: "The Piper's Call - David Gilmour", subtitle: "David Gilmour" }]));
  assert.equal(upNext(zone), "Up next: The Piper's Call - David Gilmour · 12 queued - 1:14:02 left");
});

test("Roon says nothing is queued after the current track instead of inventing a next one", () => {
  assert.equal(formatUpNext(stubs([], ""))(zone), "Nothing queued after this");
  assert.equal(formatUpNext(stubs([], "", false, ""))(zone), "");
  assert.equal(formatUpNext(stubs([{ title: "Ignored" }], "Live radio - no fixed end", true))(zone), "Live radio - no fixed end");
  assert.equal(formatUpNext(stubs([{ title: "Ignored" }], ""))(null), "");
});

test("Roon and Lyrion transport buttons are icons with spoken names, not text labels", () => {
  const roon = html.slice(html.indexOf('<div class="controls">'), html.indexOf("</div>", html.indexOf('<div class="controls">')));
  const footer = lyrion.slice(lyrion.indexOf('<footer class="lyrionStageFooter">'), lyrion.indexOf("</footer>"));
  for (const [markup, names] of [[roon, ["Previous", "Play or pause", "Stop", "Next"]], [footer, ["Previous", "Play or pause", "Stop", "Next"]]]) {
    const buttons = [...markup.matchAll(/<button[^>]*aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)];
    assert.deepEqual(buttons.map(b => b[1]), names);
    for (const [, , inner] of buttons) {
      assert.match(inner, /^<svg class="transportIcon"[^>]*aria-hidden="true">/);
      assert.equal(inner.replace(/<[^>]+>/g, "").trim(), "");
    }
  }
});

test("Lyrion's controls and seek bar sit in the art lane, directly under its Up next line", () => {
  const lane = lyrion.slice(lyrion.indexOf('<div class="lyrionArtworkLane">'), lyrion.indexOf('<section id="lyrionStageFavorites"'));
  assert.match(lane, /<p id="lyrionStageQueue" class="muted"><\/p><footer class="lyrionStageFooter">[\s\S]*<\/footer><\/div>\s*$/);
});

test("the Lyrion discovery rail stays its own column beside the art lane, not inside it", () => {
  const calls = [];
  const node = name => ({ name, hidden: false, children: [], textContent: "", value: "", classList: { contains: () => false, toggle() {} },
    setAttribute() {}, append(...items) { this.children.push(...items); }, replaceChildren() {}, addEventListener() {},
    querySelector: () => node("child"), querySelectorAll: () => [], closest: () => null,
    before(item) { calls.push([name, "before", item.id]); }, after(item) { calls.push([name, "after", item.id]); } });
  const stage = { ...node("stage"), querySelector: selector => node(selector) };
  const context = { document: { getElementById: id => (id === "lyrionNow" ? stage : null), createElement: () => node("rail") },
    MutationObserver: class { observe() {} }, setInterval() {}, setTimeout() {}, fetch: async () => ({ ok: true, json: async () => ({}) }), window: {} };
  context.window = context;
  try { vm.runInNewContext(rail, context); } catch {}
  assert.deepEqual(calls[0], [".lyrionArtworkLane", "after", "lyrionDiscoveryRail"]);
});

test("on wide screens the Roon controls and a short seek bar sit in the centre column under Up next", () => {
  const block = css.slice(css.indexOf("/* Transport under the art"));
  assert.match(block, /> \.nowUpNext \{\s*grid-column: 2;\s*grid-row: 3;/);
  assert.match(block, /> \.controls \{\s*grid-column: 2;\s*grid-row: 4;/);
  assert.match(block, /> \.seekBlock \{\s*grid-column: 2;\s*grid-row: 5;\s*justify-self: center;[\s\S]*?width: min\(100%, 560px\);/);
  assert.match(html, /<p id="nowUpNext" class="nowUpNext" aria-live="polite" hidden><\/p>\s*<div class="controls">/);
});

const { LyrionClient } = require("../src/lyrionClient");
const { createLyrionApi } = require("../src/lyrionApi");

test("Lyrion stop and play/pause send the JSON-RPC commands Lyrion documents", async () => {
  const calls = [];
  let mode = "play";
  const c = new LyrionClient({ fetchImpl: async (url, opts) => { const params = JSON.parse(opts.body).params; calls.push(params);
    return { ok: true, json: async () => ({ result: params[1][0] === "mode" ? { _mode: mode } : {} }) }; } });
  await c.control("p", "stop");
  assert.deepEqual(calls.at(-1), ["p", ["stop"]]);
  assert.equal(await c.playPauseAction("p"), "pause");
  for (mode of ["pause", "stop"]) assert.equal(await c.playPauseAction("p"), "play");
  assert.deepEqual(calls.at(-1), ["p", ["mode", "?"]]);
});

async function lyrionControl(action, lyrionMode) {
  const calls = [];
  const client = { requirePlayer: async () => {}, players: async () => [], playPauseAction: async () => (lyrionMode === "play" ? "pause" : "play"),
    control: async (player, command) => { calls.push(`lyrion:${command}`); } };
  const roon = { getState: () => ({ zones: [{ zone_id: "r", state: "playing" }] }), control: async (zone, command) => { calls.push(`roon:${command}`); } };
  const api = createLyrionApi({ roon, client, file: "does-not-exist", readJson: async () => ({ action, playerId: "p" }), sendJson: () => {} });
  await api.handle({ method: "POST", headers: {} }, {}, new URL("http://localhost:3777/api/lyrion/control"));
  return calls;
}

test("Lyrion play/pause pauses a playing player and leaves Roon alone", async () => {
  assert.deepEqual(await lyrionControl("playpause", "play"), ["lyrion:pause"]);
});

test("Lyrion play/pause starts a paused player and pauses Roon first, like Play does", async () => {
  assert.deepEqual(await lyrionControl("playpause", "pause"), ["roon:pause", "lyrion:play"]);
  assert.deepEqual(await lyrionControl("play", "pause"), ["roon:pause", "lyrion:play"]);
});

test("Lyrion stop does not touch Roon", async () => {
  assert.deepEqual(await lyrionControl("stop", "play"), ["lyrion:stop"]);
});
