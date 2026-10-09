"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");

function rules() {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

const colorOf = body => (body.match(/(?:^|;)\s*color\s*:\s*([^;]+)/) || [])[1]?.trim() || null;

test("no player-mode rule recolours the temperature values, so the green, hot and critical colours apply", () => {
  const offenders = rules().filter(r =>
    /\.pcTempChip\b[^,]*\bstrong\b|\.pcTempChip\s+:is\([^)]*\bstrong\b/.test(r.selector) &&
    /\.player|body\./.test(r.selector) &&
    colorOf(r.body)
  );
  assert.deepEqual(offenders.map(r => r.selector), []);
});

test("the temperature value has its own colour, different from the CPU/GPU label colour", () => {
  const value = rules().find(r => r.selector === ".pcTempChip strong");
  const hot = rules().find(r => r.selector === ".pcTempChip.isHot strong");
  const critical = rules().find(r => r.selector === ".pcTempChip.isCritical strong");
  assert.ok(value && colorOf(value.body), "base value colour exists");
  assert.ok(hot && colorOf(hot.body) && colorOf(hot.body) !== colorOf(value.body), "hot colour differs");
  assert.ok(critical && colorOf(critical.body) && colorOf(critical.body) !== colorOf(hot.body), "critical colour differs");
  const modeLabel = rules().find(r => /\.player:is\(\.player--regular, \.player--maximized, \.player--fullscreen\) \.pcTempChip span\b/.test(r.selector) && colorOf(r.body));
  assert.ok(modeLabel, "player-mode label colour exists");
  assert.notEqual(colorOf(modeLabel.body), colorOf(value.body));
});
