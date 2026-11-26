"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");

const css = ["styles.css", "modern.css", "lyrion.css"].map((name) => fs.readFileSync(require.resolve(`../public/${name}`), "utf8")).join("\n");

function rule(selector) {
  const at = css.indexOf(`\n${selector} {`);
  assert.notEqual(at, -1, `${selector} has a rule`);
  return css.slice(at, css.indexOf("}", at));
}

function definedVariables() {
  return new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
}

test("every on or working light uses the one shared green", () => {
  assert.match(css, /:root \{\n  --status-on: #22c55e;\n  --status-on-glow: rgba\(34, 197, 94, 0\.55\);/);
  for (const selector of [".healthCard::before", ".statusPill::before", ".resultFilterToggle:has(input:checked)::before", 'body.layoutModern .modernExtraToggle[aria-pressed="true"] .modernExtraDot']) {
    const body = rule(selector);
    assert.match(body, /background: var\(--status-on\);/, selector);
    assert.match(body, /box-shadow: 0 0 \d+px var\(--status-on-glow\);/, selector);
  }
});

test("the shared green survives every colour theme as a green", () => {
  const themes = require("../src/uiThemes").createThemes({ themesDir: require("node:path").join(__dirname, "..", "src", "themes"), defaultTheme: "original" });
  const ids = fs.readdirSync(require("node:path").join(__dirname, "..", "src", "themes")).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5));
  assert.ok(ids.length >= 9);
  for (const id of ids) {
    const out = themes.render(require("node:path").join(__dirname, "..", "public"), "x.css", Buffer.from(".x{background:#22c55e;}"), `rh_theme=${id}`).toString();
    const [r, g, b] = out.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i).slice(1).map((hex) => parseInt(hex, 16));
    assert.ok(g > r + 60 && g > b + 60, `${id} keeps the light green (got ${out})`);
  }
});

test("every status light colour is a real colour, never an undefined variable", () => {
  const defined = definedVariables();
  for (const selector of [".healthCard::before", ".healthWarn::before", ".healthBad::before", ".healthUnknown::before", ".statusPill::before", ".resultFilterToggle:has(input:checked)::before", 'body.layoutModern .modernExtraToggle[aria-pressed="true"] .modernExtraDot']) {
    const background = rule(selector).match(/background: ([^;]+);/)[1];
    for (const [, name] of background.matchAll(/var\((--[\w-]+)\)/g)) assert.ok(defined.has(name), `${selector} uses ${name}, which no stylesheet defines`);
  }
});

test("the header's model and matching line is full-strength text, like the other header labels", () => {
  const tag = rule(".appIdentity .systemTag");
  assert.match(tag, /color: var\(--text\);/);
  assert.equal(/color: rgba\([^)]*0\.58\)/.test(tag), false);
});
