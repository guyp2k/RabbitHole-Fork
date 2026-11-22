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
  assert.match(css, /#rlFilters\[hidden\] \{ display: none; \}/);
  assert.match(rule("#roonLibraryView .rlFiltersFold"), /border-left: 3px solid var\(--accent\) !important;/);
});
