"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const server = fs.readFileSync(require.resolve("../src/server.js"), "utf8");

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

test("the status snapshot tells the browser only whether Beatport is on and configured", () => {
  const availability = vm.runInNewContext(`(${fn(server, "beatportAvailability", "function beatportAvailability(status) { return status; }")})`);
  assert.deepEqual({ ...availability({ enabled: true, configured: true, tokenFile: "/secret/path", accessTokenPreview: "abc...xyz" }) }, { enabled: true, configured: true });
  assert.deepEqual({ ...availability({ enabled: false, configured: false }) }, { enabled: false, configured: false });
  assert.deepEqual({ ...availability({}) }, { enabled: false, configured: false });
  assert.match(fn(server, "appSnapshot", ""), /beatport: beatportAvailability\(beatport\.status\(\)\)/);
});

test("the Beatport menu item starts hidden and appears only when the server reports Beatport on and configured", () => {
  assert.match(html, /data-nav-item="beatport" data-view="beatportCharts" hidden>Beatport<\/button>/);
  const button = { hidden: true };
  const view = { classList: { contains: () => false } };
  const calls = [];
  const context = {
    document: { querySelectorAll: (selector) => (selector === '[data-view="beatportCharts"]' ? [button] : []) },
    $: (selector) => (selector === "#beatportChartsView" ? view : null),
    setActiveView: (target) => calls.push(target)
  };
  vm.runInNewContext(`${fn(app, "beatportAvailable", "function beatportAvailable() { return true; }")}\n${fn(app, "applyBeatportAvailability", "function applyBeatportAvailability() {}")}\nthis.apply = applyBeatportAvailability;`, context);
  context.apply({ beatport: { enabled: true, configured: true } });
  assert.equal(button.hidden, false);
  context.apply({ beatport: { enabled: true, configured: false } });
  assert.equal(button.hidden, true);
  context.apply({ beatport: { enabled: false, configured: true } });
  assert.equal(button.hidden, true);
  context.apply({});
  assert.equal(button.hidden, true, "an unknown Beatport state keeps the item hidden");
  assert.deepEqual(calls, []);
});

test("an open Beatport page moves to Discover when Beatport turns out to be off", () => {
  const calls = [];
  const context = {
    document: { querySelectorAll: () => [] },
    $: (selector) => (selector === "#beatportChartsView" ? { classList: { contains: (name) => name === "isActive" } } : null),
    setActiveView: (target) => calls.push(target)
  };
  vm.runInNewContext(`${fn(app, "beatportAvailable", "function beatportAvailable() { return true; }")}\n${fn(app, "applyBeatportAvailability", "function applyBeatportAvailability() {}")}\nthis.apply = applyBeatportAvailability;`, context);
  context.apply({ beatport: { enabled: false, configured: false } });
  assert.deepEqual(calls, ["discover"]);
  assert.match(fn(app, "applyAppState", ""), /state\.appStatus = app;\n  applyBeatportAvailability\(app\);/);
});
