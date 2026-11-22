"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../public/layoutPicker.js"), "utf8");
const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");

function harness({ cookie = "", selectPresent = true } = {}) {
  const listeners = {};
  const classes = new Set();
  const select = {
    value: "", listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; }
  };
  const document = {
    cookie,
    body: { classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name), toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } },
    getElementById: (id) => (id === "layoutSelect" && selectPresent ? select : null),
    addEventListener(type, fn) { listeners[type] = fn; }
  };
  const location = { reloaded: 0, reload() { this.reloaded += 1; } };
  vm.runInNewContext(source, { document, location });
  const ready = () => listeners.DOMContentLoaded?.();
  return { classes, select, document, location, ready };
}

test("without a layout cookie the page stays Classic: no layout class on the body and Classic selected in Settings", () => {
  const h = harness();
  assert.deepEqual([...h.classes], []);
  h.ready();
  assert.equal(h.select.value, "classic");
});

test("the Modern layout saved in the cookie puts the layoutModern class on the body before the page content loads", () => {
  const h = harness({ cookie: "a=1; rh_layout=modern; rh_theme=copper" });
  assert.deepEqual([...h.classes], ["layoutModern"]);
  h.ready();
  assert.equal(h.select.value, "modern");
});

test("an unknown or malformed layout cookie falls back to Classic", () => {
  for (const cookie of ["rh_layout=Modern", "rh_layout=fancy", "rh_layout=", "x_rh_layout=modern", "rh_layout=modern2"]) {
    const h = harness({ cookie });
    assert.deepEqual([...h.classes], [], cookie);
    h.ready();
    assert.equal(h.select.value, "classic", cookie);
  }
});

test("choosing a layout saves it in a site-wide cookie, like the theme, and reloads the page", () => {
  const h = harness();
  h.ready();
  assert.equal(typeof h.select.listeners.change, "function", "the Layout select listens for a change");
  h.select.value = "modern";
  h.select.listeners.change();
  assert.match(h.document.cookie, /^rh_layout=modern; path=\/; max-age=31536000; samesite=lax$/);
  assert.equal(h.location.reloaded, 1);
});

test("a page without the Settings control still applies the saved layout", () => {
  const h = harness({ cookie: "rh_layout=modern", selectPresent: false });
  h.ready();
  assert.deepEqual([...h.classes], ["layoutModern"]);
});

test("Settings carries the Layout picker right after the Theme picker, sharing its control styling", () => {
  assert.match(html, /<label class="zonePicker themePicker">\n              <span>Theme<\/span>\n              <select id="themeSelect" aria-label="Colour theme"><\/select>\n            <\/label>\n            <label class="zonePicker layoutPicker">\n              <span>Layout<\/span>\n              <select id="layoutSelect" aria-label="Layout"><option value="classic">Classic<\/option><option value="modern">Modern<\/option><\/select>\n            <\/label>/);
});

test("the layout script is the first thing in the body, so the layout class is set before anything paints", () => {
  assert.match(html, /<body>\n    <script src="\/layoutPicker\.js\?v=[\w-]+"><\/script>\n    <main class="shell">/);
});
