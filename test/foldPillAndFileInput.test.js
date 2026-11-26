"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");

const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");

function rule(selector) {
  const at = css.indexOf(`\n${selector} {`);
  assert.notEqual(at, -1, `${selector} has a rule`);
  return css.slice(at, css.indexOf("}", at));
}

test("a fold heading is plain text: no frosted-glass pill behind it", () => {
  const fold = rule(".panelFold");
  assert.match(fold, /backdrop-filter: none !important;/);
  assert.match(fold, /-webkit-backdrop-filter: none !important;/);
  assert.match(fold, /background: none !important;/);
});

test("every shared text-field rule leaves file pickers alone", () => {
  const fieldInputs = css.match(/input:not\(\[type="checkbox"\]\)[^,\s{]*/g) || [];
  assert.ok(fieldInputs.length >= 7, "found the shared field selectors");
  for (const selector of fieldInputs) assert.match(selector, /:not\(\[type="file"\]\)/, selector);
});

test("a file picker shows the app's button and the file name, not a text box", () => {
  const file = rule('input[type="file"]');
  assert.match(file, /padding: 0;/);
  assert.match(file, /border: 0;/);
  assert.match(file, /background: none;/);
  assert.match(file, /backdrop-filter: none !important;/, "no frosted band behind the picker");
  const button = rule('input[type="file"]::file-selector-button');
  assert.match(button, /border: 1px solid var\(--line\);/);
  assert.match(button, /border-radius: 8px;/);
});
