"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../public/themePicker.js"), "utf8");
const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");

function harness({ cookie = "", response, fail = false } = {}) {
  const listeners = {};
  const select = {
    value: "", disabled: false, options: [],
    append(option) { this.options.push(option); },
    addEventListener(type, fn) { listeners[type] = fn; }
  };
  const document = {
    cookie,
    getElementById: (id) => (id === "themeSelect" ? select : null),
    createElement: () => ({ value: "", textContent: "" })
  };
  const location = { reloaded: 0, reload() { this.reloaded += 1; } };
  const fetch = async (url) => {
    assert.equal(url, "/api/themes");
    if (fail) throw new Error("offline");
    return { ok: true, json: async () => response };
  };
  const context = { document, location, fetch };
  vm.runInNewContext(source, context);
  return { select, document, location, listeners, settle: () => new Promise((r) => setImmediate(r)) };
}

const THEMES = { themes: [{ id: "copper", label: "Obsidian & Copper" }, { id: "original", label: "Original" }], default: "copper" };

test("the picker lists every theme the server offers and selects the default without a cookie", async () => {
  const h = harness({ response: THEMES });
  await h.settle();
  assert.deepEqual(h.select.options.map((o) => [o.value, o.textContent]), [["copper", "Obsidian & Copper"], ["original", "Original"]]);
  assert.equal(h.select.value, "copper");
});

test("the picker selects the theme saved in the cookie", async () => {
  const h = harness({ cookie: "a=1; rh_theme=original", response: THEMES });
  await h.settle();
  assert.equal(h.select.value, "original");
});

test("choosing a theme saves it in a site-wide cookie and reloads the page", async () => {
  const h = harness({ response: THEMES });
  await h.settle();
  h.select.value = "original";
  h.listeners.change();
  assert.match(h.document.cookie, /^rh_theme=original; path=\/; max-age=31536000; samesite=lax$/);
  assert.equal(h.location.reloaded, 1);
});

test("the picker is disabled when the theme list cannot be loaded", async () => {
  const h = harness({ fail: true });
  await h.settle();
  assert.equal(h.select.disabled, true);
  assert.equal(h.select.options.length, 0);
});

test("the Settings header carries the theme picker and loads its script", () => {
  assert.match(html, /<select id="themeSelect" aria-label="Colour theme"><\/select>/);
  assert.match(html, /<script src="\/themePicker\.js(\?v=[\w-]+)?"><\/script>/);
});

test("the theme picker sizes to its options instead of stretching across the Settings row", () => {
  const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
  const zone = css.lastIndexOf(".settingsPanel > .topControls .zonePicker select {");
  const rule = css.indexOf(".settingsPanel > .topControls .themePicker {");
  assert.ok(rule > zone, "the theme picker rule comes after the stretching zonePicker rules");
  const body = css.slice(rule, css.indexOf("}", rule));
  assert.match(body, /justify-self: start;/);
  assert.match(body, /width: auto;/);
  assert.match(body, /min-width: 0;/);
  const select = css.slice(css.indexOf(".settingsPanel > .topControls .themePicker select {"));
  assert.match(select.slice(0, select.indexOf("}")), /width: auto;/);
});
