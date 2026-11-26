"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
const controls = fs.readFileSync(require.resolve("../public/viewControls.js"), "utf8");

function foldHarness(saved) {
  const store = new Map(saved ? [["rabbitHole.fold.taste.topArtists", saved]] : []);
  const target = { hidden: false };
  const caret = { textContent: "" };
  const listeners = {};
  const button = { dataset: { foldKey: "taste.topArtists" }, attrs: { "aria-controls": "topArtists" }, listeners,
    getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = String(v); },
    querySelector: () => caret };
  button.listeners.click = () => listeners.documentClick({ target: { closest: () => button } });
  const context = {
    document: { createElement: () => ({}), querySelectorAll: () => [button], getElementById: (id) => (id === "topArtists" ? target : null),
      addEventListener(t, f) { if (t === "click") listeners.documentClick = f; } },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  };
  context.window = context;
  vm.runInNewContext(controls, context);
  return { button, target, caret, store };
}

test("a fold heading remembers its section per browser and hides it, shared by every page", () => {
  const open = foldHarness(null);
  assert.equal(open.button.attrs["aria-expanded"], "true");
  assert.equal(open.target.hidden, false);
  assert.equal(open.caret.textContent, "▾");
  open.button.listeners.click();
  assert.equal(open.target.hidden, true);
  assert.equal(open.button.attrs["aria-expanded"], "false");
  assert.equal(open.caret.textContent, "▸");
  assert.equal(open.store.get("rabbitHole.fold.taste.topArtists"), "1");
  const folded = foldHarness("1");
  assert.equal(folded.target.hidden, true);
});

test("every Taste panel folds from its heading", () => {
  for (const [key, id, label] of [["topArtists", "topArtists", "Top Artists"], ["topTracks", "topTracks", "Top Tracks"], ["tasteSignals", "tasteSignals", "Taste Signals"], ["recentPlays", "recentPlays", "Recent Plays"]]) {
    assert.match(html, new RegExp(`<h3 class="panelFoldHeading"><button type="button" class="panelFold" data-fold-key="taste\\.${key}" aria-controls="${id}" aria-expanded="true"><span class="panelFoldCaret" aria-hidden="true">▾</span>${label}</button></h3>`), label);
  }
  assert.match(css, /:is\(\.reportList, \.signalGrid, [^)]*\)\[hidden\] \{\s*display: none;/);
});

test("Taste's artist and track lists use the shared Thumbnails | List switch", () => {
  assert.match(app, /\$\("#historyView \.reportHero \.resultActions"\)\?\.append\(window\.RabbitHoleViewControls\.layoutSwitch\(\{ key: "rabbitHole\.layout\.taste", name: "Artist and Track", defaultLayout: "list",/);
  assert.match(css, /\.tasteCardsView :is\(#topArtists, #topTracks, #recentPlays\) \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(140px, 1fr\)\);/);
  assert.match(css, /\.tasteCardsView :is\(#topArtists, #topTracks, #recentPlays\) \.reportRow :is\(strong, span\) \{[^}]*text-overflow: ellipsis;/);
  assert.match(css, /#historyView \.historyGrid \{\s*align-items: start;/);
});

test("Taste's metric and signal headings are Title Case", () => {
  for (const label of ["Observed Plays", "Listening Time", "Active Days", "Discovery Pool", "Favored Traits", "Genre Lane", "Listening Shape", "Discovery Sources", "Avoid / Calibrate", "Liked Artists", "Liked Labels", "Rejected Artists", "Rejected Labels", "Scored Memories", "Radio Feedback"]) {
    assert.ok(app.includes(`"${label}"`), label);
  }
});
