"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
const server = fs.readFileSync(require.resolve("../src/server.js"), "utf8");
const coverage = fs.readFileSync(require.resolve("../public/sonicCoverage.js"), "utf8");

function fn(source, name, stub) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return stub;
  let depth = 0;
  for (let i = source.indexOf(") {\n", start) + 2; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  return stub;
}

function harness(active) {
  const nav = { hidden: true }, production = { hidden: true }, coveragePanel = { hidden: true }, profile = { hidden: false };
  const calls = [];
  const context = {
    document: { querySelectorAll: (selector) => (selector === '[data-requires="sonic"]' ? [nav, production, coveragePanel] : []) },
    $: (selector) => ({ "#nowSonicProfile": profile, "#sonicReviewView": { classList: { contains: (name) => active && name === "isActive" } } })[selector] || null,
    setActiveView: (target) => calls.push(target)
  };
  vm.runInNewContext(`${fn(app, "sonicAvailable", "function sonicAvailable() { return true; }")}\n${fn(app, "applySonicAvailability", "function applySonicAvailability() {}")}\nthis.apply = applySonicAvailability;`, context);
  return { ...context, nav, production, coveragePanel, profile, calls };
}

test("the status snapshot reports Sonic as available only when the engine and its coverage service are running", () => {
  assert.match(fn(server, "appSnapshot", ""), /sonic: \{ available: Boolean\(recommendationEngineV2\.enabled && sonicCoverage\) \}/);
});

test("every Sonic surface starts hidden and is marked as needing Sonic", () => {
  assert.match(html, /data-nav-item="sonic-review" data-view="sonicReview" data-requires="sonic" hidden>Sonic Review<\/button>/);
  assert.match(html, /class="settingsSection sonicProductionSettings"[^>]*data-requires="sonic" hidden>/);
  assert.match(html, /id="sonicCoveragePanel"[^>]*data-requires="sonic" hidden>/);
  assert.match(html, /<span data-requires="sonic" hidden> The Sonic sections control/);
  assert.match(css, /\[data-requires\]\[hidden\] \{\s*display: none;/);
});

test("Sonic surfaces appear when the server reports Sonic available and hide again when it does not", () => {
  const h = harness(false);
  h.apply({ sonic: { available: true } });
  assert.deepEqual([h.nav.hidden, h.production.hidden, h.coveragePanel.hidden], [false, false, false]);
  h.apply({ sonic: { available: false } });
  assert.deepEqual([h.nav.hidden, h.production.hidden, h.coveragePanel.hidden, h.profile.hidden], [true, true, true, true]);
  h.apply({});
  assert.equal(h.nav.hidden, true, "an unknown Sonic state keeps it hidden");
  assert.deepEqual(h.calls, []);
});

test("an open Sonic Review page moves to Settings when Sonic is off", () => {
  const h = harness(true);
  h.apply({ sonic: { available: false } });
  assert.deepEqual(h.calls, ["settings"]);
});

test("the Now Playing Sonic profile stays hidden and makes no request while Sonic is off", () => {
  assert.match(fn(app, "renderNowSonicProfileEditor", ""), /if \(!root\) return;\n  if \(!sonicAvailable\(state\.appStatus \|\| \{\}\)\) \{\n    root\.hidden = true;\n    return;\n  \}/);
  assert.match(fn(app, "applyAppState", ""), /applyBeatportAvailability\(app\);\n  applySonicAvailability\(app\);/);
});

test("Sonic coverage stops polling while its panel is hidden", () => {
  assert.match(coverage, /const visible = \(\) => view\.classList\.contains\("isActive"\) && !panel\.hidden && !document\.hidden;/);
  assert.match(coverage, /new MutationObserver\(shown\)\.observe\(panel,\{attributes:true,attributeFilter:\["hidden"\]\}\);/);
});
