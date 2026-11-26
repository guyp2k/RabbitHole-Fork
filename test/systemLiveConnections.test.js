"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");

function fn(name, stub = "") {
  const start = app.indexOf(`function ${name}(`);
  if (start < 0) return stub;
  let depth = 0;
  for (let i = app.indexOf(") {\n", start) + 2; i < app.length; i += 1) {
    if (app[i] === "{") depth += 1;
    if (app[i] === "}" && --depth === 0) return app.slice(start, i + 1);
  }
  return stub;
}

function section(id) {
  const start = html.indexOf(`<section id="${id}"`);
  return html.slice(start, html.indexOf("\n      <section id=", start + 10));
}

function load(names) {
  const context = { escapeHtml: (value) => String(value) };
  vm.runInNewContext(names.map((name) => fn(name, `function ${name}() { return {}; }`)).join("\n") + `\nthis.api = { ${names.join(", ")} };`, context);
  return context.api;
}

test("Connections shows live service cards instead of a static list, and Diagnostics no longer repeats them", () => {
  const connections = section("connectionsView");
  assert.match(connections, /<p class="pageIntro">Every service Rabbit Hole talks to, whether it is working right now/);
  assert.match(connections, /<section id="systemHealth" class="systemHealth" aria-live="polite"><\/section>/);
  assert.equal(connections.includes("systemScopeItem"), false);
  assert.equal(html.includes("LM Studio"), false, "the local model is not always LM Studio");
  assert.equal(section("diagnosticsView").includes('id="systemHealth"'), false);
  assert.match(section("diagnosticsView"), /Whether each service is reachable is on Connections\./);
});

test("the AI page shows live AI cards and links to the AI mode setting", () => {
  const ai = section("aiView");
  assert.match(ai, /<p class="pageIntro">Which AI is answering Rabbit Hole's requests and how it is doing\./);
  assert.match(ai, /<section id="aiHealth" class="systemHealth" aria-live="polite"><\/section>/);
  assert.match(ai, /<button type="button" data-view-jump="settings">Change AI Mode in Settings<\/button>/);
  assert.equal(ai.includes("systemScopeItem"), false);
  assert.match(app, /document\.querySelectorAll\("\[data-view-jump\]"\)\.forEach\(\(button\) => \{\n  button\.addEventListener\("click", \(\) => setActiveView\(button\.dataset\.viewJump\)\);/);
});

test("Beatport and Sonic cards say Off when switched off, and are never shown as working without a report", () => {
  const { beatportHealthSummary, sonicHealthSummary } = load(["beatportHealthSummary", "sonicHealthSummary"]);
  assert.equal(beatportHealthSummary({}).status, "not checked");
  assert.deepEqual([beatportHealthSummary({ beatport: { enabled: false, configured: false } }).level, beatportHealthSummary({ beatport: { enabled: false, configured: false } }).status], ["unknown", "off"]);
  assert.deepEqual([beatportHealthSummary({ beatport: { enabled: true, configured: false } }).level, beatportHealthSummary({ beatport: { enabled: true, configured: false } }).status], ["warn", "not configured"]);
  assert.equal(beatportHealthSummary({ beatport: { enabled: true, configured: true } }).level, "ok");
  assert.equal(sonicHealthSummary({}).status, "not checked");
  assert.deepEqual([sonicHealthSummary({ sonic: { available: false } }).level, sonicHealthSummary({ sonic: { available: false } }).status], ["unknown", "off"]);
  assert.deepEqual([sonicHealthSummary({ sonic: { available: true } }).level, sonicHealthSummary({ sonic: { available: true } }).status], ["ok", "running"]);
});

test("the AI Mode card names the mode and who answered the last request", () => {
  const { aiModeHealthSummary } = load(["aiModeHealthSummary"]);
  assert.equal(aiModeHealthSummary(null).status, "not checked");
  assert.deepEqual({ ...aiModeHealthSummary({ mode: "auto", lastDecision: { provider: "local" } }) }, { level: "ok", status: "auto", detail: "Last request answered by the local model" });
  assert.deepEqual({ ...aiModeHealthSummary({ mode: "auto", lastDecision: { provider: "synapse", fallback: true } }) }, { level: "warn", status: "auto", detail: "Last request answered by Synapse (fallback)" });
  assert.equal(aiModeHealthSummary({ mode: "local" }).detail, "No requests answered yet");
});

test("the Synapse Usage card shows today's cost and this session's calls", () => {
  const { synapseUsageHealthSummary } = load(["formatUsd", "compactInteger", "synapseUsageHealthSummary"]);
  assert.equal(synapseUsageHealthSummary(null).status, "not checked");
  assert.deepEqual({ ...synapseUsageHealthSummary({ synapse: { enabled: true, usage: { todayCostUsd: 0.5, session: { calls: 3, costUsd: 0.25 } } } }) }, { level: "ok", status: "$0.50 today", detail: "This session: 3 calls, $0.25" });
  assert.equal(synapseUsageHealthSummary({ synapse: { enabled: false } }).level, "unknown");
});

test("a service card Title Cases its status and shows what the service is for", () => {
  const { healthCardHtml } = load(["headingCase", "providerHealthClass", "healthCardHtml"]);
  const card = healthCardHtml({ level: "warn", label: "Last.fm", status: "username missing", purpose: "Listening history for your taste profile", detail: "scrobble history unavailable" });
  assert.match(card, /<strong>Username Missing<\/strong>/);
  assert.match(card, /<p class="healthPurpose">Listening history for your taste profile<\/p>/);
  assert.match(card, /<small>scrobble history unavailable<\/small>/);
});

test("Connections lists every service, folds, and refreshes the AI cards with it", () => {
  const render = fn("renderSystemHealth");
  for (const label of ["TIDAL Search", "TIDAL Profile", "Radio Art TIDAL", "Last.fm", "Local Model", "Synapse", "Rabbit Hole MCP", "Beatport", "Sonic"]) {
    assert.ok(render.includes(`label: "${label}"`), label);
  }
  assert.match(render, /purpose: "Plays music and reports zones, queue and library"/);
  assert.match(render, /data-fold-key="connections\.services"/);
  assert.match(render, /renderAiHealth\(\);\n\}$/);
  const ai = fn("renderAiHealth");
  for (const label of ["AI Mode", "Local Model", "Synapse", "Synapse Usage", "Rabbit Hole MCP"]) assert.ok(ai.includes(`label: "${label}"`), label);
  assert.match(ai, /data-fold-key="ai\.services"/);
  assert.match(ai, /window\.RabbitHoleViewControls\?\.applyFolds\(container\);\n\}$/);
});
