"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const view = fs.readFileSync(require.resolve("../public/synapseMemory.js"), "utf8");
const controls = fs.readFileSync(require.resolve("../public/viewControls.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
const server = fs.readFileSync(require.resolve("../src/server.js"), "utf8");

function fn(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return `function ${name}(value) { return value; }`;
  let depth = 0;
  for (let i = source.indexOf(") {\n", start) + 2; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  return "";
}

function constant(name) {
  const match = view.match(new RegExp(`const ${name} = [\\s\\S]*?;\\n`));
  return match ? match[0] : `const ${name} = {};\n`;
}

function helpers() {
  const context = {};
  vm.runInNewContext(`${constant("SMALL_WORDS")}${constant("SOURCE_LABELS")}${["labelCase", "sourceLabel", "formatWhen", "sortEntries", "statsText"].map((name) => fn(view, name)).join("\n")}\nthis.api = { labelCase, sourceLabel, formatWhen, sortEntries, statsText };`, context);
  return context.api;
}

function block() {
  const start = html.indexOf('<section id="synapseMemoryView"');
  return html.slice(start, html.indexOf("\n      </section>\n", start));
}

test("memory categories and sources read as words, not code names", () => {
  const { labelCase, sourceLabel } = helpers();
  assert.equal(labelCase("user_preferences"), "User Preferences");
  assert.equal(labelCase("music_discovery"), "Music Discovery");
  assert.equal(labelCase("project_state"), "Project State");
  assert.equal(sourceLabel("rabbit_hole_taste"), "Learned From Your Ratings");
  assert.equal(sourceLabel("rabbit_hole_standby"), "From Standby Picks");
  assert.equal(sourceLabel("explicit_user"), "Added by You");
  assert.equal(sourceLabel("some_new_source"), "Some New Source");
});

test("dates are shown as local dates, and a missing date says Never instead of a raw value", () => {
  const { formatWhen } = helpers();
  assert.equal(formatWhen(""), "Never");
  assert.equal(formatWhen("not a date"), "Never");
  const shown = formatWhen("2026-11-20T19:17:30.232Z");
  assert.equal(shown.includes("T19:17"), false);
  assert.match(shown, /2026/);
});

test("the summary line counts memories in words and lists only categories that have entries", () => {
  const { statsText } = helpers();
  const text = statsText({ count: 2, updatedAt: "", approximateStoredTokens: 723, maxContextChars: 4500, categories: [{ category: "user_preferences", count: 1 }, { category: "project_state", count: 0 }, { category: "music_discovery", count: 1 }] });
  assert.match(text, /^2 Memories · Updated Never · About 723 tokens stored · The AI reads up to 4,500 characters of them per request\. User Preferences 1, Music Discovery 1\.$/);
  assert.equal(text.includes("project_state"), false);
  assert.match(statsText({ count: 1, categories: [] }), /^1 Memory · /);
});

test("memories sort newest, oldest, by importance or by category", () => {
  const { sortEntries } = helpers();
  const entries = [
    { id: "a", category: "user_rules", importance: 50, updatedAt: "2026-11-01T00:00:00Z" },
    { id: "b", category: "music_discovery", importance: 90, updatedAt: "2026-11-20T00:00:00Z" },
    { id: "c", category: "user_preferences", importance: 70, updatedAt: "2026-10-01T00:00:00Z" }
  ];
  const ids = (sort) => [...sortEntries(entries, sort)].map((entry) => entry.id).join("");
  assert.equal(ids("newest"), "bac");
  assert.equal(ids("oldest"), "cab");
  assert.equal(ids("importance"), "bca");
  assert.equal(ids("category"), "bca");
  assert.equal(entries[0].id, "a", "sorting never reorders the stored list");
});

test("the page leads with the memories, with a count and a remembered sort, and the forms start folded", () => {
  const section = block();
  const list = section.indexOf('data-fold-key="synapseMemory.entries"');
  const edit = section.indexOf('data-fold-key="synapseMemory.edit" data-fold-default="closed" aria-controls="synapseMemoryEditBody"');
  const imported = section.indexOf('data-fold-key="synapseMemory.import" data-fold-default="closed" aria-controls="synapseMemoryImportBody"');
  assert.ok(list > 0 && edit > list && imported > edit, "View Memories, then Add / Edit, then Import / Export");
  assert.match(section, /<span id="synapseMemoryCount" class="synapseMemoryCount"><\/span>/);
  assert.match(section, /<select id="synapseMemorySort" aria-label="Sort memories"><option value="newest">Newest First<\/option><option value="oldest">Oldest First<\/option><option value="importance">Most Important<\/option><option value="category">Category<\/option><\/select>/);
  assert.match(view, /window\.RabbitHoleViewControls\?\.bindSort\(\$\("synapseMemorySort"\), "rabbitHole\.sort\.synapseMemory", \(\) => state && render\(\)\);/);
  assert.match(css, /\.synapseMemoryForm \{\s*display: grid;\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.synapseMemoryPanel \.synapseMemoryCheck input\[type="checkbox"\] \{[^}]*width: 18px;/);
});

test("a fold marked closed by default starts closed until the user opens it, then remembers", () => {
  const store = new Map();
  let onClick;
  const target = { hidden: false };
  const button = { dataset: { foldKey: "synapseMemory.edit", foldDefault: "closed" }, attrs: { "aria-controls": "body" },
    getAttribute(n) { return this.attrs[n]; }, setAttribute(n, v) { this.attrs[n] = String(v); }, querySelector: () => null };
  const context = {
    document: { createElement: () => ({}), querySelectorAll: () => [button], getElementById: () => target, addEventListener(t, f) { if (t === "click") onClick = f; } },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  };
  context.window = context;
  vm.runInNewContext(controls, context);
  assert.equal(target.hidden, true);
  onClick({ target: { closest: () => button } });
  assert.equal(target.hidden, false);
  assert.equal(store.get("rabbitHole.fold.synapseMemory.edit"), "0");
});

test("long memories are clamped with Show More, and editing opens the folded form", () => {
  assert.match(view, /if \(String\(entry\.text\)\.length > LONG_TEXT\) \{\n        text\.classList\.add\("isClamped"\);/);
  assert.match(view, /more\.textContent = open \? "Show Less" : "Show More";/);
  assert.match(css, /\.synapseMemoryEntry p\.isClamped \{[^}]*-webkit-line-clamp: 3;/);
  assert.match(view, /if \(editFold\?\.getAttribute\("aria-expanded"\) === "false"\) editFold\.click\(\);/);
  assert.equal(view.includes("${entry.id} ·"), false, "the raw id is not shown");
});

test("the standby memory Rabbit Hole writes uses a plain hyphen between artist and title", () => {
  assert.match(server, /map\(t=>`\$\{t\.artist\} - \$\{t\.title\} \(rank \$\{t\.rank\}\)`\)/);
  assert.equal(/\$\{t\.artist\} [\u2013\u2014]/.test(server), false);
});
