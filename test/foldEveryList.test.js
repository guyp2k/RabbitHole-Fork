"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
const controls = fs.readFileSync(require.resolve("../public/viewControls.js"), "utf8");

function foldHeading(key, body, label) {
  return `<h3 class="panelFoldHeading"><button type="button" class="panelFold" data-fold-key="${key}" aria-controls="${body}" aria-expanded="true"><span class="panelFoldCaret" aria-hidden="true">▾</span>${label}</button></h3>`;
}

test("every static list has a fold heading that controls a wrapper around the list", () => {
  for (const [key, body, label, list] of [
    ["queue.roon", "queueFoldBody", "Roon Queue", "liveQueue"],
    ["library.albums", "rlFoldBody", "Albums", "rlResults"],
    ["radio.stations", "radioFoldBody", "Stations", "radioStations"],
    ["standby.tracks", "standbyFoldBody", "Tracks", "standbyTracks"],
    ["beatport.tracks", "beatportFoldBody", "Tracks", "beatportChartTracks"],
    ["musicMemory.tracks", "musicMemoryFoldBody", "Tracks", "musicMemoryResults"],
    ["synapseMemory.entries", "synapseMemoryFoldBody", "View Memories", "synapseMemoryEntries"]
  ]) {
    const at = html.indexOf(foldHeading(key, body, label));
    assert.ok(at > 0, `${label} fold heading for ${list}`);
    const wrapper = html.indexOf(`<div id="${body}"`, at);
    assert.ok(wrapper > at, `${body} follows its heading`);
    assert.ok(html.indexOf(`id="${list}"`, wrapper) > wrapper, `${list} sits inside ${body}`);
  }
});

test("the Roon queue keeps its scroll limit inside the fold wrapper", () => {
  assert.match(css, /:is\(#queueFoldBody, #lyrionQueueFoldBody\) > \.liveQueue \{\s*max-height: min\(68vh, 720px\);/);
});

test("the Database results fold from a caret beside the results heading", () => {
  assert.match(html, /<button type="button" class="panelFold dbResultsFold" data-fold-key="database\.results" aria-controls="dbFoldBody" aria-expanded="true" aria-label="Show or hide the results"><span class="panelFoldCaret" aria-hidden="true">▾<\/span><\/button><h3 id="dbResultsHeading"/);
  assert.match(html, /<div id="dbFoldBody"><div id="dbResults"/);
});

test("the Roon queue shows its title once, on the fold heading", () => {
  assert.equal(app.includes("<strong>Roon Queue</strong>"), false);
});

test("each TIDAL mix section folds and its folds are re-applied after every render", () => {
  assert.match(app, /data-fold-key="tidal\.pinned" aria-controls="tidalMixCardsPinned"/);
  assert.match(app, /data-fold-key="tidal\.official" aria-controls="tidalMixCardsOfficial"/);
  assert.match(app, /<div id="tidalMixCardsOfficial" class="tidalMixCards">/);
  assert.match(app, /window\.RabbitHoleViewControls\?\.applyFolds\(grid\);\n\}/);
  assert.match(css, /\.tidalMixCards \{\s*display: contents;/);
  assert.match(css, /:is\([^)]*\.tidalMixCards[^)]*\)\[hidden\] \{\s*display: none;/);
});

test("a fold heading rendered after start-up still toggles and keeps its saved state", () => {
  const store = new Map([["rabbitHole.fold.tidal.pinned", "1"]]);
  let onClick;
  const target = { hidden: false };
  const caret = { textContent: "" };
  const button = { dataset: { foldKey: "tidal.pinned" }, attrs: { "aria-controls": "tidalMixCardsPinned" },
    getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = String(v); }, querySelector: () => caret };
  const buttons = [];
  const context = {
    document: { createElement: () => ({}), querySelectorAll: () => buttons, getElementById: () => target,
      addEventListener(t, f) { if (t === "click") onClick = f; } },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  };
  context.window = context;
  vm.runInNewContext(controls, context);
  buttons.push(button);
  context.RabbitHoleViewControls.applyFolds({ querySelectorAll: () => [button] });
  assert.equal(target.hidden, true);
  assert.equal(button.attrs["aria-expanded"], "false");
  onClick({ target: { closest: () => button } });
  assert.equal(target.hidden, false);
  assert.equal(caret.textContent, "▾");
  assert.equal(store.get("rabbitHole.fold.tidal.pinned"), "0");
  onClick({ target: { closest: () => null } });
  assert.equal(target.hidden, false);
});
