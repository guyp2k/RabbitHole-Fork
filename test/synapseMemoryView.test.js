"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const pub = path.join(__dirname, "..", "public");
const html = fs.readFileSync(path.join(pub, "index.html"), "utf8");
const app = fs.readFileSync(path.join(pub, "app.js"), "utf8");
const view = fs.readFileSync(path.join(pub, "synapseMemory.js"), "utf8");

test("Synapse Memory opens inside the app under System, after AI, instead of a separate page", () => {
  assert.match(html, /data-nav-item="ai" data-view="ai">AI<\/button>\s*<button type="button" data-nav-group="system" data-nav-item="synapse-memory" data-view="memory">Synapse Memory<\/button>/);
  assert.doesNotMatch(html, /data-nav-group="memory" data-nav-item="synapse-memory"/);
  assert.match(app, /memory: \{ group: "system", item: "synapse-memory" \}/);
  assert.doesNotMatch(app, /memory\.html/);
  assert.match(app, /\$\("#synapseMemoryView"\)\?\.classList\.toggle\("isActive", target === "memory"\);/);
  assert.match(app, /if \(target === "memory"\) window\.RabbitHoleSynapseMemory\?\.show\(\);/);
  assert.equal(fs.existsSync(path.join(pub, "memory.html")), false);
  assert.equal(fs.existsSync(path.join(pub, "memory.js")), false);
  assert.match(html, /<script src="\/synapseMemory\.js\?v=1"><\/script>/);
});

test("Synapse Memory explains itself and its labels are Title Case with plain hyphens", () => {
  const start = html.indexOf('id="synapseMemoryView"');
  assert.ok(start >= 0);
  const block = html.slice(start, html.indexOf("\n      </section>\n", start));
  assert.match(block, /<h2 id="synapseMemoryHeading">Synapse Memory<\/h2>\s*<p class="pageIntro">Notes the AI reads as background when it builds suggestions: things about you, what you like and what to avoid\. Synapse and the local model both use them; Local-Only entries stay out of the AI's context\. Import a profile or summary, or add entries here\. Nothing is read from ChatGPT automatically\.<\/p>/);
  for (const label of ["Import \\/ Export", "Add \\/ Edit", "View Memories", "Export Local Memory", "New Entry", "Tags \\(Comma Separated\\)", "Importance \\(0-100\\)", "Expires \\(Leave Blank for Permanent\\)", "Local-Only: Exclude From the AI's Context"]) {
    assert.match(block, new RegExp(label), label);
  }
  assert.doesNotMatch(block, /[–—]/);
  assert.match(view, /edit\.textContent = "Edit";/);
  assert.match(view, /forget\.textContent = "Forget";/);
  assert.match(view, /\(entry\.sensitive \? " · Local-Only" : ""\)/);
});

test("the in-app view uses its own element ids, so it cannot collide with the rest of the app", () => {
  const ids = [...view.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 10);
  for (const id of ids) {
    assert.match(id, /^synapseMemory[A-Z]/, id);
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});
