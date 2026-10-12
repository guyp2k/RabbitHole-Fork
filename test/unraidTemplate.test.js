"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const template = read("unraid/RabbitHole-Fork.xml");
const configs = [...template.matchAll(/<Config Name="([^"]+)" Target="([^"]+)" Default="([^"]*)" Mode="[^"]*" Description="([^"]*)" Type="(Path|Variable)"/g)]
  .map(([, name, target, fallback, description, type]) => ({ name, target, fallback, description, type }));
const source = fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".js")).map((f) => read(`src/${f}`)).join("\n");

test("every template setting is parsed, so none is silently dropped by a typo", () => {
  assert.equal(configs.length, (template.match(/<Config /g) || []).length);
  assert.ok(configs.length > 10);
});

test("every template variable is one the app or the entrypoint actually reads", () => {
  const entrypoint = read("scripts/docker-entrypoint.sh");
  for (const { target, type } of configs.filter((c) => c.type === "Variable")) {
    const read = new RegExp(`process\\.env\\.${target}\\b`).test(source) || new RegExp(`\\$\\{${target}[:}]`).test(entrypoint);
    assert.ok(read, `${target} (${type}) is not read anywhere`);
  }
});

test("the LLM provider choices offered are the ones the model client handles", () => {
  const provider = configs.find((c) => c.target === "LLM_PROVIDER");
  const offered = [...provider.description.matchAll(/\b(ollama|openai-compatible|openrouter|lmstudio|openai)\b/g)].map((m) => m[1]);
  assert.deepEqual(offered, ["ollama", "openai-compatible", "openrouter"]);
  assert.match(source, /llmProvider === "openrouter"/);
  assert.match(read(".env.example"), /# LLM_PROVIDER=openai-compatible/);
});

test("the template keeps data in the image's data folder and pulls the image CI publishes", () => {
  assert.deepEqual(configs.filter((c) => c.type === "Path").map((c) => c.target), ["/app/data"]);
  assert.match(read("Dockerfile"), /mkdir -p \/app\/data/);
  assert.match(template, /<Repository>ghcr\.io\/guyp2k\/rabbithole-fork:latest<\/Repository>/);
  assert.match(read(".github/workflows/image.yml"), /image=ghcr\.io\/\$\{GITHUB_REPOSITORY,,\}/);
  assert.match(template, /<Network>host<\/Network>/);
});

test("the template leaves TZ to Unraid, which passes the server's own time zone", () => {
  assert.doesNotMatch(template, /Target="TZ"/, "a template TZ comes after Unraid's and an empty one silently switches the app to UTC");
});

test("exactly the secrets are masked, and Unraid's nobody:users owns the data", () => {
  const masked = [...template.matchAll(/Target="([^"]+)"[^>]*Mask="true"/g)].map((m) => m[1]).sort();
  const secrets = configs.map((c) => c.target).filter((t) => /KEY|SECRET|TOKEN|PASSWORD/.test(t)).sort();
  assert.deepEqual(masked, secrets);
  assert.deepEqual(secrets, ["LLM_API_KEY", "OPENROUTER_API_KEY", "TIDAL_CLIENT_SECRET"]);
  assert.deepEqual(["PUID", "PGID"].map((t) => configs.find((c) => c.target === t).fallback), ["99", "100"]);
});

test("the image starts as root only long enough to hand the data folder to PUID:PGID", () => {
  const dockerfile = read("Dockerfile"), entrypoint = read("scripts/docker-entrypoint.sh");
  assert.doesNotMatch(dockerfile, /^USER /m);
  assert.match(dockerfile, /ENTRYPOINT \["\/app\/scripts\/docker-entrypoint\.sh"\]\nCMD \["node", "src\/server\.js"\]/);
  assert.match(entrypoint, /uid="\$\{PUID:-1000\}"\n  gid="\$\{PGID:-1000\}"/, "without PUID/PGID it runs as the image's node user, as before");
  assert.match(entrypoint, /exec setpriv --reuid="\$uid" --regid="\$gid" --clear-groups -- "\$@"/);
  assert.ok(fs.statSync(path.join(root, "scripts/docker-entrypoint.sh")).mode & 0o111, "the entrypoint is executable");
});
