"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
const coverage = fs.readFileSync(require.resolve("../public/sonicCoverage.js"), "utf8");

function section(id) {
  const start = html.indexOf(`<section id="${id}"`);
  return html.slice(start, html.indexOf("\n      <section id=", start + 10));
}

function fn(name) {
  const start = app.indexOf(`function ${name}(`);
  let depth = 0;
  for (let i = app.indexOf(") {\n", start) + 2; i < app.length; i += 1) {
    if (app[i] === "{") depth += 1;
    if (app[i] === "}" && --depth === 0) return app.slice(start, i + 1);
  }
  return "";
}

test("Diagnostics and Settings explain themselves in a page intro", () => {
  assert.match(section("diagnosticsView"), /<p class="pageIntro">Look under the hood of the last Rabbit Hole run\./);
  assert.match(section("settingsView"), /<p class="pageIntro">How Rabbit Hole thinks, plays and looks/);
});

test("every Settings section folds from its heading and keeps its controls inside the fold", () => {
  const settings = section("settingsView");
  for (const [key, body, label, inside] of [
    ["settings.general", "settingsGeneralBody", "AI, Zone and Appearance", "zoneSelect"],
    ["settings.sonicProduction", "sonicProductionBody", "Sonic Review in Recommendations", "sonicProductionModeSelect"],
    ["settings.sonicCoverage", "sonicCoverageBody", "Sonic Audio Coverage", "sonicCoverageLimits"]
  ]) {
    const at = settings.indexOf(`data-fold-key="${key}" aria-controls="${body}" aria-expanded="true"><span class="panelFoldCaret" aria-hidden="true">▾</span>${label}</button>`);
    assert.ok(at > 0, label);
    const wrapper = settings.indexOf(`<div id="${body}">`, at);
    assert.ok(wrapper > at, `${body} follows its heading`);
    assert.ok(settings.indexOf(`id="${inside}"`, wrapper) > wrapper, `${inside} sits inside ${body}`);
  }
});

test("the Settings control row keeps its layout inside the fold wrapper", () => {
  assert.equal(css.includes(".settingsPanel > .topControls"), false);
  assert.match(css, /#settingsGeneralBody > \.topControls \{/);
});

test("Settings labels, options and buttons are Title Case with no dashes", () => {
  const settings = section("settingsView");
  assert.equal(/[–—]/.test(settings), false);
  for (const label of ["Sonic Production Mode", "Off: Current Ordering", "Observe: Log Only", "Blend: Capped Score Adjustment", "Start Backfill", "Pause All", "Cancel Backfill", "Retry Failed", "Preparation Limits", "Tracks per Batch", "Parallel Preparations", "Seconds Between Starts", "Seconds Between Batches", "Apply Limits", "Recent Preparation Failures"]) {
    assert.ok(settings.includes(label), label);
  }
  assert.match(coverage, /\["Total Eligible",job\.totalEligible\],\["Already Embedded",job\.alreadyEmbedded\]/);
  for (const label of ["Sonic Review Unavailable", "Observe Only · Ordering Preserved", "Off · Current Ordering Preserved"]) assert.ok(app.includes(`"${label}"`), label);
});

test("a coverage error that already ends in a full stop is not shown with two", () => {
  const line = coverage.match(/error = (`Could not update coverage: [^`]*`);/)[1];
  const render = (message) => vm.runInNewContext(line, { failure: { message } });
  assert.equal(render("Sonic coverage is unavailable."), "Could not update coverage: Sonic coverage is unavailable. Refresh to retry.");
  assert.equal(render("timeout"), "Could not update coverage: timeout. Refresh to retry.");
});

test("an unlimited diversity cap reads No Cap instead of the largest safe integer", () => {
  const capValueText = vm.runInNewContext(`(${fn("capValueText") || "function capValueText(value) { return String(value || \"n/a\"); }"})`);
  assert.equal(capValueText(9007199254740991), "No Cap");
  assert.equal(capValueText(Infinity), "n/a");
  assert.equal(capValueText(3), "3");
  assert.equal(capValueText(undefined), "n/a");
  assert.equal(capValueText(0), "n/a");
  assert.match(fn("poolDiagnosticsHtml"), /\["Label cap", capValueText\(diversityCaps\.labelCap\)\]/);
});

test("every Diagnostics section folds from its heading and re-applies the saved fold after each render", () => {
  for (const [render, show, key, body, label] of [
    ["poolDiagnosticsHtml", "showPoolDiagnostics", "pool", "poolDiagnosticsBody", "Pool Diagnostics"],
    ["sourceReportHtml", "showSourceReport", "sources", "sourceReportBody", "Candidate Source Report"],
    ["rejectedDebugHtml", "updateRejectedDebug", "rejected", "rejectedDebugBody", "Rejected / Discarded"],
    ["intentDebugHtml", "showIntentDebug", "intent", "intentDebugBody", "Intent Parsed"]
  ]) {
    const source = fn(render);
    assert.ok(source.includes(`diagnosticFoldHeadHtml("${key}", "${body}", "${label}")`), label);
    assert.match(source, new RegExp(`<div id="${body}"`), `${label} body`);
    assert.match(fn(show), /window\.RabbitHoleViewControls\?\.applyFolds\((panel|container)\);\n\}$/, `${show} re-applies folds`);
  }
  assert.match(css, /:is\([^)]*\.healthGrid, \.intentDebugGrid\)\[hidden\] \{\s*display: none;/);
});

test("Sonic Review buttons and headings are Title Case", () => {
  for (const label of ["Shadow Review · Strict Queue", "Use Current Track", "Stored Identity or TIDAL Track URL", "Load Anchor", "Open Listening Batch", "Choose an Anchor", "No Track Loaded Yet", "Ready for a Sonic Anchor</strong>"]) {
    assert.ok(app.includes(label), label);
  }
  assert.match(css, /\.sonicReviewAnchorRow button,\n\.sonicReviewAnchorToolsHead button \{\s*white-space: nowrap;/);
});
