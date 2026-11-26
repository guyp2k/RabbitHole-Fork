"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const lyrion = fs.readFileSync(require.resolve("../public/lyrion.js"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");

function appFn(name) {
  const start = app.indexOf(`function ${name}(`);
  return start < 0 ? `function ${name}() {}` : app.slice(start, app.indexOf("\n}\n", start) + 2);
}

function siriusHarness(activeTab) {
  const tabs = Object.fromEntries(["channels", "shows", "artists", "xtra", "now"].map((id) => [`lyrionTab-${id}`, { hidden: true }]));
  const stage = { hidden: true };
  const selected = [];
  const start = lyrion.indexOf("  const SIRIUSXM_TABS=");
  const end = lyrion.indexOf("  try{selectTab(localStorage.getItem('rabbitHole.lyrionTab')");
  const code = start >= 0 && end > start ? lyrion.slice(start, end) : "function syncSiriusXm(){}";
  const context = { sources: [], activeTab, $: (id) => (id === "lyrionStageFavorites" ? stage : tabs[id]), selectTab: (id) => selected.push(id) };
  vm.runInNewContext(`${code}\nthis.sync = syncSiriusXm;`, context);
  return { context, tabs, stage, selected };
}

test("the SiriusXM tabs and Favorite Channels appear only when the player reports a SiriusXM source", () => {
  const h = siriusHarness("now");
  h.context.sources = [{ id: "local" }, { id: "tidal" }];
  h.context.sync();
  for (const id of ["channels", "shows", "artists", "xtra"]) assert.equal(h.tabs[`lyrionTab-${id}`].hidden, true, id);
  assert.equal(h.stage.hidden, true);
  h.context.sources = [{ id: "local" }, { id: "siriusxm" }];
  h.context.sync();
  for (const id of ["channels", "shows", "artists", "xtra"]) assert.equal(h.tabs[`lyrionTab-${id}`].hidden, false, id);
  assert.equal(h.stage.hidden, false);
  assert.deepEqual(h.selected, []);
});

test("an open SiriusXM tab moves to Now Playing when the player has no SiriusXM source", () => {
  const h = siriusHarness("shows");
  h.context.sources = [{ id: "local" }];
  h.context.sync();
  assert.deepEqual(h.selected, ["now"]);
  assert.match(lyrion, /sources=availableSources\.sources;syncSiriusXm\(\);/);
  assert.match(lyrion, /<section id="lyrionStageFavorites" class="lyrionRail" aria-labelledby="lyrionStageFavoritesHeading" hidden>/);
});

test("Lyrion Home has a title, an explanation and a fold on every shelf", () => {
  assert.match(lyrion, /<div class="lyrionHomeHead"><p class="eyebrow">Lyrion<\/p><h2>Home<\/h2><p class="pageIntro">What the selected Lyrion player can play/);
  for (const [key, body, label, list] of [["lyrion.newMusic", "lyrionNewMusicBody", "New Music", "lyrionNewMusic"], ["lyrion.favorites", "lyrionRadiosBody", "Favorites", "lyrionRadios"], ["lyrion.explore", "lyrionExploreBody", "Explore", "lyrionExplore"]]) {
    const at = lyrion.indexOf(`data-fold-key="${key}" aria-controls="${body}" aria-expanded="true"><span class="panelFoldCaret" aria-hidden="true">▾</span>${label}</button>`);
    assert.ok(at > 0, label);
    const wrapper = lyrion.indexOf(`<div id="${body}">`, at);
    assert.ok(wrapper > at && lyrion.indexOf(`<ul id="${list}"`, wrapper) > wrapper, `${list} sits inside ${body}`);
  }
  assert.match(lyrion, /document\.querySelector\("\.shell"\)\.append\(ui\);\n  window\.RabbitHoleViewControls\?\.applyFolds\(ui\);/);
});

test("the Lyrion queue folds under one Lyrion Queue heading and counts items in words", () => {
  assert.match(lyrion, /<div class="lyrionQueueFoldHead"><h3 class="panelFoldHeading"><button type="button" class="panelFold" data-fold-key="lyrion\.queue" aria-controls="lyrionQueueFoldBody"/);
  assert.equal(lyrion.includes("<strong>Lyrion queue</strong>"), false);
  const line = lyrion.match(/\$\("lyrionQueueCount"\)\.textContent=(`[^\n]*`);/)[1];
  const count = (queueCount, length, offset = 0) => vm.runInNewContext(line, { s: { queueCount, queue: { length } }, queueOffset: offset });
  assert.equal(count(1, 1), "1 Item · Showing 1-1");
  assert.equal(count(12, 10, 0), "12 Items · Showing 1-10");
  assert.equal(count(0, 0), "0 Items");
});

test("a labelled fold button keeps its label when it folds and unfolds", () => {
  const toggle = { dataset: { foldLabel: "Sources" }, attrs: {}, innerHTML: "", textContent: "", setAttribute(k, v) { this.attrs[k] = String(v); } };
  const context = { $: () => toggle };
  vm.runInNewContext(`${appFn("escapeHtml")}\n${appFn("setPanelFolded")}\nthis.fold = setPanelFolded;`, context);
  context.fold("#t", null, true, "the sources");
  assert.equal(toggle.innerHTML, '<span class="panelFoldCaret" aria-hidden="true">▸</span>Sources');
  assert.equal(toggle.attrs["aria-expanded"], "false");
  context.fold("#t", null, false, "the sources");
  assert.equal(toggle.innerHTML, '<span class="panelFoldCaret" aria-hidden="true">▾</span>Sources');
});

test("every Lyrion label is Title Case", () => {
  for (const label of ["Now Playing", "Artist Stations", "Xtra Channels", "Choose a Player", "Choose Your Lyrion Player", "Favorite Channels", "Favorite SiriusXM Channels", "SiriusXM Shows on Demand", "Find Shows", "Back to Results", "Favorite Artist Stations", "Find Stations", "My Stations", "Favorite This Station", "Stop Adding Songs", "SiriusXM Xtra Channels", "Favorite Xtra Channels", "Find Channels", "Browse All Xtra Channels", "Favorite This Channel", "Connect SoundCloud Playlists", "SiriusXM Metadata", "Search Source", "Search All Sources", "Browse Source", "Load More", "Clear Queue", "Next Queue Page", "Play Now", "Play Next", "Add to Queue", "Album Artist", "File Size", "Track Length"]) {
    assert.ok(lyrion.includes(label), label);
  }
  for (const old of [">Now playing<", "'Now playing'", "'Artist stations'", "'Xtra channels'", ">Clear queue<", ">Search source<", ">Search all sources<", ">Browse source<", ">Load more<", '"Play now"', '"Play next"', '"Add to queue"', '"Album artist"', '"File size"', '"Track length"']) {
    assert.equal(lyrion.includes(old), false, old);
  }
  assert.match(app, /detailRows\.push\(\{ label: "Track Length"/);
});

test("both queue pages share one scroll limit, so a Lyrion queue card never spills out of its box", () => {
  const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
  assert.match(css, /:is\(#queueFoldBody, #lyrionQueueFoldBody\) > \.liveQueue \{\s*max-height: min\(68vh, 720px\);\s*overflow: auto;/);
});

test("the Sources and Browse folds are plain labelled headings, not boxed buttons, overriding the boxed style inside its own cascade layer", () => {
  const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
  const at = css.indexOf("@layer folds {\n  .resultsToggle.panelFold,\n  .resultsToggle.panelFold:hover {");
  assert.notEqual(at, -1);
  const rule = css.slice(at, css.indexOf("}", at));
  for (const declaration of ["border: 0 !important;", "background: none !important;", "box-shadow: none !important;", "font-size: 12px !important;"]) assert.ok(rule.includes(declaration), declaration);
});

test("the browse count reads as a number of items in words", () => {
  const line = lyrion.match(/\$\("lyrionBrowseTitle"\)\.textContent=result\.message \|\| (`[^`]*`);/)[1];
  assert.equal(vm.runInNewContext(line, { result: { count: 63795 } }), "63,795 Items");
  assert.equal(vm.runInNewContext(line, { result: { count: 1 } }), "1 Item");
});

test("Sources, its search box and Browse share one label column, and Setup reads as a small menu with its own arrow", () => {
  const css = fs.readFileSync(require.resolve("../public/lyrion.css"), "utf8");
  assert.match(css, /#lyrionView \{--lyrion-label-col:96px;\}/);
  assert.match(css, /#lyrionSearch \{padding-left:calc\(var\(--lyrion-label-col\) \+ 12px\);\}/);
  assert.match(css, /#lyrionView #lyrionSetup > summary::before \{\s*display: none !important;/);
  assert.match(css, /#lyrionView #lyrionSetup > summary::after \{\s*content: "\\25BE" !important;/);
});

test("Lyrion Home and the Browse results have the shared Thumbnails | List switch, remembered per browser", () => {
  assert.match(lyrion, /\$\("lyrionHomeView"\)\.querySelector\("\.lyrionHomeHead"\)\.append\(window\.RabbitHoleViewControls\.layoutSwitch\(\{ key: "rabbitHole\.layout\.lyrionHome", name: "Lyrion Home", onChange: \(layout\) => \$\("lyrionHomeView"\)\.classList\.toggle\("lyrionHomeListView", layout === "list"\) \}\)\);/);
  assert.match(lyrion, /\$\("lyrionBrowseTitle"\)\.after\(window\.RabbitHoleViewControls\.layoutSwitch\(\{ key: "rabbitHole\.layout\.lyrionBrowse", name: "Browse Results", defaultLayout: "list", onChange: \(layout\) => \$\("lyrionResultsBody"\)\.classList\.toggle\("lyrionResultsCardsView", layout === "cards"\) \}\)\);/);
  const css = fs.readFileSync(require.resolve("../public/lyrion.css"), "utf8");
  assert.match(css, /#lyrionView \.lyrionHomeListView \.lyrionShelfRow \{grid-auto-flow:row;[^}]*grid-template-columns:repeat\(auto-fill,minmax\(280px,1fr\)\);/);
  assert.match(css, /#lyrionView \.lyrionHomeListView \.lyrionCardArt \{grid-row:1 \/ span 2;width:48px;/);
  assert.match(css, /#lyrionView \.lyrionResultsCardsView \.lyrionResultList \{grid-template-columns:repeat\(auto-fill,minmax\(170px,1fr\)\);/);
  assert.match(css, /#lyrionView \.lyrionResultsCardsView \.lyrionResultRow \.queueArt \{width:100%;height:auto;aspect-ratio:1;\}/);
});
