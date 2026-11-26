"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const styles = fs.readFileSync(path.join(__dirname, "..", "public", "styles.css"), "utf8");
const app = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
const layerStart = styles.indexOf("@layer folds {");
const layer = layerStart === -1 ? "" : styles.slice(layerStart, styles.indexOf("\n}\n", layerStart));
const rule = selector => {
  const start = layer.indexOf(`\n\n  ${selector} {`);
  assert.notEqual(start, -1, `${selector} rule exists in @layer folds`);
  return layer.slice(start, layer.indexOf("\n  }", start));
};
const forced = (block, property) => assert.match(block, new RegExp(`${property}[^;]*!important;`), `${property} is forced`);

test("every disclosure marker is a plain accent arrow, like the fold headings, with no box behind it", () => {
  assert.notEqual(layerStart, -1, "@layer folds exists");
  const marker = rule("summary::before");
  for (const property of ["border: 0", "border-radius: 0", "background: none", "box-shadow: none", "min-width: 0", "min-height: 0", "padding: 0", "width: auto", "height: auto", "color: var\\(--accent\\)", "font-size: 12px", "transform: none"]) {
    forced(marker, property);
  }
  assert.equal(layer.includes("  .resultsToggle,\n  summary::before {"), false, "summary markers no longer share the boxed button rule");
});

test("section disclosures read as fold headings, while track and record details keep their own text", () => {
  const heading = rule("summary:not(.trackDetails > summary, #dbTrackDetail summary)");
  for (const property of ["color: var\\(--accent\\)", "font-size: 12px", "font-weight: 800", "text-transform: uppercase"]) forced(heading, property);
  const count = rule("summary:not(.trackDetails > summary, #dbTrackDetail summary) :is(span, small, em, b)");
  for (const property of ["color: var\\(--muted\\)", "text-transform: none"]) forced(count, property);
});

test("a disclosure shows only the fold button: no native triangle and no second marker", () => {
  forced(rule("summary"), "list-style: none");
  forced(rule("summary::-webkit-details-marker"), "display: none");
  forced(rule("summary::after"), "content: none");
});

test("disclosures use the same closed and open glyphs as the panel fold buttons", () => {
  assert.match(app, /folded \? "\\u25B8" : "\\u25BE"/);
  forced(rule("summary::before"), 'content: "\\\\25B8"');
  forced(rule("details[open] > summary::before"), 'content: "\\\\25BE"');
});

test("hovering a disclosure does not draw a glow box around its arrow", () => {
  assert.equal(layer.includes("summary:hover::before"), false);
  forced(rule("summary::before"), "box-shadow: none");
});
