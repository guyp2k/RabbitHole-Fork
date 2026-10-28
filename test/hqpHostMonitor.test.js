"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const agentDir = path.join(root, "integrations", "hqp-host-monitor");

function dockerignoreRules(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
    const negate = line.startsWith("!");
    const pattern = (negate ? line.slice(1) : line).replace(/^\/+/, "").replace(/\/+$/, "");
    const source = pattern.split("/").map((part) => part === "**" ? ".*" : part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")).join("/");
    return { negate, regex: new RegExp(`^${source.replace(/\/\.\*$/, "(/.*)?").replace(/^\.\*\//, "(.*/)?")}$`) };
  });
}

function excludedFromContext(rules, file) {
  const parts = file.split("/");
  const candidates = parts.map((_, index) => parts.slice(0, index + 1).join("/"));
  let excluded = false;
  for (const rule of rules) if (candidates.some((candidate) => rule.regex.test(candidate))) excluded = !rule.negate;
  return excluded;
}

test("the HQP host monitor never reaches the Rabbit Hole image build context", () => {
  const rules = dockerignoreRules(fs.readFileSync(path.join(root, ".dockerignore"), "utf8"));
  const files = fs.readdirSync(agentDir).map((name) => `integrations/hqp-host-monitor/${name}`);
  assert.ok(files.length >= 4);
  for (const file of files) assert.equal(excludedFromContext(rules, file), true, `${file} would be sent to the image build`);
  for (const file of ["src/server.js", "public/index.html", "package.json", "integrations/soundspectrum-hqplayer-feed/lifecycle.test.cjs"]) {
    assert.equal(excludedFromContext(rules, file), false, `${file} should stay in the build context`);
  }
  assert.equal(excludedFromContext(rules, "README.md"), true);
});

test("the HQP host monitor's own tests pass", () => {
  const run = spawnSync("python3", ["-m", "unittest", "-q"], { cwd: agentDir, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  assert.equal(run.error, undefined, String(run.error));
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stderr, /^OK$/m);
});

test("the HQP host monitor ships no LAN addresses, only documentation addresses", () => {
  for (const name of fs.readdirSync(agentDir)) {
    const text = fs.readFileSync(path.join(agentDir, name), "utf8");
    const addresses = text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || [];
    for (const address of addresses) {
      assert.ok(/^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|127\.0\.0\.1$|0\.0\.0\.0$)/.test(address), `${name} contains ${address}`);
    }
  }
});

test("the HQP host monitor runs at nice 19 and never in the idle scheduling class", () => {
  const unit = fs.readFileSync(path.join(agentDir, "hqp-host-monitor.service"), "utf8");
  assert.match(unit, /^Nice=19$/m);
  assert.doesNotMatch(unit, /CPUSchedulingPolicy/);
  assert.doesNotMatch(unit, /^User=root$/m);
});
