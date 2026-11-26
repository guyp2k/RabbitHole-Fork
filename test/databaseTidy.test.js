"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const { browseCatalog } = require("../src/databaseBrowserCatalog");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const page = fs.readFileSync(require.resolve("../public/database.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/database.css"), "utf8");

test("the Database page says what it is under its title", () => {
  assert.match(html, /<h2 id="databaseHeading">Database<\/h2><p class="dbIntro">Everything Rabbit Hole remembers about tracks it has played, queued, discovered or looked up, and how you rated them\. Recommendations are built from this\. It is not your Roon library; use Library for that\.<\/p>/);
});

test("Database lives under System, in the navigation and in the view map", () => {
  assert.match(html, /<button type="button" data-nav-group="system" data-nav-item="database" data-view="database">Database<\/button>/);
  assert.doesNotMatch(html, /data-nav-group="playback" data-nav-item="database"/);
  assert.match(app, /database: \{ group: "system", item: "database" \},/);
});

test("the browse reply says how many local files were scanned, so an unscanned Local Library can be hidden", () => {
  const base = { records: [], sonicAvailable: false, generatedAt: "2026-11-26T00:00:00Z" };
  assert.equal(browseCatalog(base, { view: "tags" }).localFileCount, 0);
  assert.equal(browseCatalog({ ...base, localMedia: { records: [{}, {}], scans: [], sonicAvailable: false } }, { view: "tags" }).localFileCount, 2);
  assert.match(page, /\$\("\[data-db-local\]"\)\.hidden = !payload\.localFileCount && state\.filters\.media !== "local";/);
});

test("without Sonic data the Sonic column and Sonic filters are hidden instead of reading Unavailable on every row", () => {
  assert.match(page, /const sonic = Boolean\(payload\.sonicAvailable\);/);
  assert.match(page, /\$\{sonic \? heading\("Sonic"\) : ""\}/);
  assert.match(page, /root\.querySelectorAll\("\[data-db-sonic\]"\)\.forEach\(element => \{ element\.hidden = !sonic; \}\);/);
  assert.match(html, /<button type="button" data-db-quick="missing" data-db-sonic>Missing Sonic<\/button>/);
  assert.match(html, /<label data-db-sonic>Sonic<select name="sonic">/);
});

test("sortable column headings and track titles are plain text like the other headings, with an arrow on the sorted column", () => {
  assert.match(css, /#databaseView \.dbTable :is\(th button, \.dbTrackTitle\) \{[^}]*border: 0 !important;[^}]*background: none !important;[^}]*box-shadow: none !important;[^}]*min-height: 0 !important;/);
  assert.match(page, /\$\{label\}\$\{sort && state\.sort === sort \? `<span class="dbSortArrow" aria-hidden="true">\$\{state\.direction === "asc" \? "▲" : "▼"\}<\/span>` : ""\}/);
});

test("folding the filters gives the results the width", () => {
  assert.match(css, /\.dbLayout:has\(\.dbFilterPanel:not\(\[open\]\)\) \{ grid-template-columns: max-content minmax\(0, 1fr\); \}/);
  assert.match(css, /\.dbSidebar:has\(\.dbFilterPanel:not\(\[open\]\)\) \.dbScopeNote \{ display: none; \}/);
});
