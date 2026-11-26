"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../public/roonLibrary.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/roonLibrary.css"), "utf8");
const context = { document: { querySelector: () => null }, localStorage: { getItem: () => null, setItem() {} } };
context.window = context;
vm.runInNewContext(source, context);
const { filterSummary } = context.RoonLibraryFilters;
const rule = (selector) => css.slice(css.indexOf(`${selector} {`)).split("}")[0];

test("the folded filter heading names only the filters that are set, without Roon's album counts", () => {
  const blank = { text: "", selects: [{ name: "storage", value: "", label: "All Libraries" }, { name: "sort", value: "artist", label: "Artist" }], toggles: [] };
  assert.equal(filterSummary(blank), "");
  assert.equal(filterSummary({
    text: "  bowie ",
    selects: [{ name: "storage", value: "Hi-Res", label: "Hi-Res (214)" }, { name: "genre", value: "Jazz", label: "Jazz (80)" }, { name: "sort", value: "most_played", label: "Most Played" }],
    toggles: ["Favorites", "Unplayed 90 Days"]
  }), "“bowie” · Hi-Res · Jazz · Most Played · Favorites · Unplayed 90 Days");
  assert.equal(filterSummary({ text: "", selects: [{ name: "sort", value: "artist", label: "Artist" }], toggles: ["Favorites"] }), "Favorites");
});

test("every album card keeps its buttons on one line across the row, and long titles and artists clamp to two lines with the full text on hover", () => {
  assert.match(rule(".rlActions"), /margin-top: auto;/);
  assert.match(rule(".rlCard :is(.dbCollectionName, .dbCollectionMeta)"), /-webkit-line-clamp: 2;/);
  assert.match(source, /el\("span", \{ className: "dbCollectionName", textContent: album\.title, title: album\.title \}\)/);
  assert.match(source, /el\("span", \{ className: "dbCollectionMeta", textContent: meta, title: meta \}\)/);
});

test("the filters fold away under a Filters heading that is remembered per browser", () => {
  assert.match(source, /const fold = el\("button", \{ type: "button", className: "rlFiltersFold" \}\);\s*fold\.setAttribute\("aria-controls", "rlFilters"\);/);
  assert.match(source, /localStorage\.setItem\(FOLD_KEY, folded \? "1" : "0"\)/);
  assert.match(source, /fold\.setAttribute\("aria-expanded", String\(!folded\)\);\s*form\.hidden = folded;/);
  assert.match(css, /#roonLibraryView :is\(#rlFilters, \.rlFiltersFold, #rlResults, #rlSections\)\[hidden\] \{ display: none !important; \}/);
  assert.match(rule("#roonLibraryView .rlFiltersFold"), /border-left: 3px solid var\(--accent\) !important;/);
});

const { cardMeta, viewStatus } = context.RoonLibraryFilters;

test("a card's second line adds Roon's play count or the day it was last played to artist, year and format", () => {
  assert.equal(cardMeta({ artist: "Porcupine Tree", year: 2002, format: "FLAC 44/24" }), "Porcupine Tree · 2002 · FLAC 44/24");
  assert.equal(cardMeta({ artist: "Roger Waters", plays: 83 }), "Roger Waters · 83 Plays");
  assert.equal(cardMeta({ artist: "Someone", plays: 1 }), "Someone · 1 Play");
  assert.equal(cardMeta({ artist: "Stargarden", lastPlayed: "2026-11-22 15:07" }), "Stargarden · Played Nov 22, 2026");
});

test("each Show view says what it lists, and an empty view says so instead of looking like a blank page", () => {
  assert.equal(viewStatus("recent", { sections: [{ albums: [{}, {}] }] }), "The last 2 library albums played in Roon. Streams that are not in your library are left out.");
  assert.equal(viewStatus("top", { since: "2024-12-27 09:21", sections: [{ albums: [{}] }] }), "Your 1 most played album in Roon since Dec 27, 2024.");
  assert.equal(viewStatus("picks", { day: "2026-11-22", sections: [{ albums: [{}] }, { albums: [{}, {}] }] }), "Roon's Daily Picks for Nov 22, 2026. Albums not in your library can be played from Roon.");
  assert.equal(viewStatus("recent", { sections: [{ albums: [] }] }), "Nothing to show here yet.");
  assert.equal(viewStatus("picks", { sections: [] }), "Nothing to show here yet.");
});

test("the Show row swaps the filters for the chosen view and remembers it per browser, and albums outside the library get no play buttons", () => {
  const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
  assert.deepEqual([...html.matchAll(/data-rl-view="(\w+)"/g)].map((m) => m[1]), ["library", "recent", "top", "picks"]);
  assert.match(html, /<ul id="rlResults"[^>]*><\/ul>\s*<div id="rlSections" class="rlSections" hidden><\/div>/);
  assert.match(source, /localStorage\.setItem\(VIEW_KEY, view\)/);
  assert.match(source, /fetch\(`\/api\/roon-library\/view\/\$\{view\}`\)|getJson\(`\/api\/roon-library\/view\/\$\{view\}`\)/);
  assert.match(source, /playable\(album\) \? actionsFor\(album\) : el\("span", \{ className: "rlNote", textContent: "Not In Your Library" \}\)/);
  assert.match(rule(".rlNote"), /margin-top: auto;/);
});

test("only albums in the Roon library get play buttons, because Roon plays an album by finding it in the library", () => {
  const { playable } = context.RoonLibraryFilters;
  assert.equal(playable({ key: "72495", inLibrary: true }), true);
  assert.equal(playable({ key: "106799" }), true);
  assert.equal(playable({ key: "13215910", inLibrary: false }), false);
  assert.equal(playable({ key: "", inLibrary: false }), false);
});

test("the Library switches between thumbnails and a one-row-per-album list, remembered per browser", () => {
  const page = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
  assert.match(page, /<div class="rlLayoutSwitch" role="group" aria-label="Album View"><button type="button" data-rl-layout="cards" aria-pressed="true">Thumbnails<\/button><button type="button" data-rl-layout="list" aria-pressed="false">List<\/button><\/div>/);
  assert.match(source, /const LAYOUT_KEY = "rabbitHole\.rlLayout";/);
  assert.match(source, /view\.classList\.toggle\("rlListView", layout === "list"\);/);
  assert.match(source, /localStorage\.setItem\(LAYOUT_KEY, layout\)/);
  assert.match(css, /#roonLibraryView\.rlListView \.rlCard \{[^}]*grid-template-areas: "art name actions" "art meta actions";/);
  assert.match(css, /#roonLibraryView\.rlListView \.rlGrid \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
});
