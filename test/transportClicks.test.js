"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const START = 'document.addEventListener("click", async (event) => {\n  const ';
const from = app.indexOf(START);
const handlerSource = app.slice(from, app.indexOf("\n});\n", from) + 5);

function node(tag, dataset = {}, parent = null) {
  return { tag, dataset, parent,
    closest(selectors) {
      const wanted = selectors.split(",").map((s) => s.trim().match(/^(\w+)?\[data-([\w-]+)\]$/));
      for (let n = this; n; n = n.parent) {
        if (wanted.some((m) => m && (!m[1] || m[1] === n.tag) && m[2].replace(/-(\w)/g, (_, c) => c.toUpperCase()) in n.dataset)) return n;
      }
      return null;
    } };
}

function harness() {
  const calls = [];
  let listener;
  const context = { document: { addEventListener: (type, fn) => { if (type === "click") listener = fn; } },
    activeZone: () => ({ zone_id: "z1" }), api: async (url, body) => { calls.push([url, body]); }, alert: (m) => calls.push(["alert", m]) };
  vm.runInNewContext(handlerSource, context);
  return { calls, click: async (target) => { await listener({ target }); return JSON.parse(JSON.stringify(calls)); } };
}

test("the click handler is found in app.js", () => {
  assert.notEqual(from, -1);
  assert.match(handlerSource, /\/api\/control/);
});

test("clicking the icon inside a transport button sends that button's control to the active Roon zone", async () => {
  for (const control of ["previous", "playpause", "stop", "next"]) {
    const button = node("button", { control });
    const path = node("path", {}, node("svg", {}, button));
    assert.deepEqual(await harness().click(path), [["/api/control", { zoneId: "z1", control }]]);
  }
});

test("clicking a transport button itself still sends its control", async () => {
  assert.deepEqual(await harness().click(node("button", { control: "next" })), [["/api/control", { zoneId: "z1", control: "next" }]]);
});

test("a Vol button sends a relative volume step for its output, from the button or anything inside it", async () => {
  const button = node("button", { output: "o1", volume: "-1" });
  const expected = [["/api/volume", { outputId: "o1", how: "relative_step", value: -1 }]];
  assert.deepEqual(await harness().click(button), expected);
  assert.deepEqual(await harness().click(node("span", {}, button)), expected);
});

test("a click anywhere else sends nothing", async () => {
  assert.deepEqual(await harness().click(node("div", {}, node("section"))), []);
});
