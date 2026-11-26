"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");

test("headings built at runtime are Title Case, keeping small joining words and existing capitals", () => {
  const start = app.indexOf("function headingCase(");
  assert.ok(start >= 0);
  const end = app.indexOf("\n}\n", start) + 2;
  const context = {};
  vm.runInNewContext(app.slice(start, end) + "\nthis.headingCase = headingCase;", context);
  assert.equal(context.headingCase("10 verified tracks (13 discarded from 49)"), "10 Verified Tracks (13 Discarded From 49)");
  assert.equal(context.headingCase("4 exact-artist shown from 10 verified tracks"), "4 Exact-Artist Shown From 10 Verified Tracks");
  assert.equal(context.headingCase("a mix of the best and the rest in TIDAL"), "A Mix of the Best and the Rest in TIDAL");
});

test("the headings Pat flagged on Discover read in Title Case", () => {
  assert.match(app, /title\.textContent = "No Chart Loaded";/);
  assert.match(app, /title\.textContent = `\$\{count\}\/\$\{target\} Standby Tracks`;/);
  assert.match(html, /<h2 id="standbyTitle">0\/25 Standby Tracks<\/h2>/);
  assert.match(app, /\$\("#resultTitle"\)\.textContent = headingCase\(discarded/);
  assert.match(app, /<strong>No TIDAL Profile Mixes Loaded\.<\/strong>/);
});

test("no heading the app writes at runtime is left in sentence case", () => {
  const small = new Set(["a", "an", "and", "or", "of", "to", "the", "in", "on", "for", "by", "with"]);
  const bad = [];
  const check = (text, where) => {
    const words = text.trim().split(/\s+/);
    if (words.some((word, index) => /^[a-z]/.test(word) && (index === 0 || !small.has(word)))) bad.push(`${where}: ${text}`);
  };
  for (const m of app.matchAll(/<(h2|h3|strong)\b[^>]*>([^<$]{3,80})<\/\1>/g)) if (!/:$/.test(m[2])) check(m[2], m[1]);
  for (const m of app.matchAll(/(?:Title"\)|title)\.textContent = "([^"]+)"/g)) check(m[1], "title");
  assert.deepEqual(bad, []);
});

test("Audit Exact Artists is a toggle shaped like the buttons beside it, lit when on", () => {
  assert.match(html, /<span>Audit Exact Artists<\/span>/);
  assert.match(css, /\.resultFilterToggle \{[^}]*border-radius: 8px;[^}]*min-height: 38px|\.resultFilterToggle \{[^}]*min-height: 38px;[^}]*border-radius: 8px;/);
  assert.match(css, /\.resultFilterToggle input \{[^}]*opacity: 0;/);
  assert.match(css, /\.resultFilterToggle:has\(input:checked\)::before \{[^}]*background: var\(--accent\);/);
  assert.match(css, /\.resultFilterToggle:has\(input:focus-visible\) \{[^}]*outline: 2px solid var\(--accent\);/);
});

test("the browser layout check loads headingCase with the results renderer that calls it", () => {
  const harness = fs.readFileSync(require.resolve("../scripts/check-rabbit-hole-browser.cjs"), "utf8");
  assert.match(harness, /"headingCase",/);
});
