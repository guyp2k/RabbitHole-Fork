"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");

const css = fs.readFileSync(require.resolve("../public/lyrion.css"), "utf8");
const html = fs.readFileSync(require.resolve("../public/lyrion.js"), "utf8");

test("a Lyrion toolbar or chip row stacked straight under another gets the same 12px the toolbar puts between its own controls", () => {
  const toolbarGap = css.match(/\.lyrionToolbar \{[^}]*gap:(\d+)px/)[1];
  const rule = css.match(/#lyrionView :is\(\.lyrionToolbar, \.lyrionChoices\) \+ :is\(\.lyrionToolbar, \.lyrionChoices\), #lyrionView \.lyrionFavoriteList \+ p:empty \+ \.lyrionToolbar \{([^}]*)\}/);
  assert.ok(rule, "stacked-row rule is missing");
  assert.match(rule[1], new RegExp(`margin-top: ?${toolbarGap}px`));
});

test("the rows that touched are still direct neighbours, so the stacked-row rule reaches them", () => {
  assert.match(html, /<\/form>\s*<div id="lyrionArtistShortcuts" class="lyrionChoices"/);
  assert.match(html, /<\/form>\s*<div id="lyrionXtraShortcuts" class="lyrionChoices"/);
  assert.match(html, /<form id="lyrionSearch" class="lyrionToolbar">[\s\S]*?<\/form>\s*<div class="lyrionToolbar"><button type="button" id="lyrionResultsToggle"/);
});

test("the status line under a row of shortcut chips keeps clear of the chips", () => {
  assert.match(css, /#lyrionView \.lyrionChoices \+ p \{ margin-top:10px; \}/);
  assert.match(html, /<div id="lyrionArtistShortcuts" class="lyrionChoices"[^>]*><\/div>\s*<p id="lyrionArtistStatus"/);
  assert.match(html, /<div id="lyrionXtraShortcuts" class="lyrionChoices"[^>]*><\/div>\s*<p id="lyrionXtraStatus"/);
});

test("an empty favorites list's status line does not stop the search row below it getting its gap", () => {
  assert.match(html, /<ul id="lyrionArtistFavorites" class="lyrionFavoriteList"><\/ul><p id="lyrionArtistFavoritesStatus" role="status" aria-live="polite"><\/p>\s*<form id="lyrionArtistSearch" class="lyrionToolbar">/);
  assert.match(html, /<ul id="lyrionXtraFavorites" class="lyrionFavoriteList"><\/ul><p id="lyrionXtraFavoritesStatus" role="status" aria-live="polite"><\/p>\s*<form id="lyrionXtraSearch" class="lyrionToolbar">/);
});
