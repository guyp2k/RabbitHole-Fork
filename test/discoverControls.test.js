"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
const controlsSource = fs.readFileSync(require.resolve("../public/viewControls.js"), "utf8");

const fn = (name) => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  return app.slice(start, app.indexOf("\n}\n", start) + 2);
};
const ctx = {};
vm.runInNewContext(fn("sortedTrackEntries") + "\nthis.sorted = sortedTrackEntries;", ctx);
const tracks = [
  { title: "Rooster", artist: "Alice In Chains", durationMs: 376000, bpm: 0 },
  { title: "all I Ever Am", artist: "The Cure", durationMs: 483000, bpm: 124 },
  { title: "Mihalis", artist: "David Gilmour", durationMs: 361000, bpm: 98 }
];
const order = (sort) => JSON.parse(JSON.stringify(ctx.sorted(tracks, sort))).map((e) => e.index);

test("Discover track lists sort by title, artist, length or BPM while keeping each track's rank", () => {
  assert.deepEqual(order("original"), [0, 1, 2]);
  assert.deepEqual(order("title"), [1, 2, 0]);
  assert.deepEqual(order("artist"), [0, 2, 1]);
  assert.deepEqual(order("longest"), [1, 0, 2]);
  assert.deepEqual(order("bpm"), [2, 1, 0]);
});

test("the shared controls remember a page's sort and can start a page in List", () => {
  const store = new Map();
  const context = { document: { createElement: () => ({ dataset: {}, setAttribute() {}, append() {}, addEventListener() {} }) }, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
  context.window = context;
  vm.runInNewContext(controlsSource, context);
  assert.equal(context.RabbitHoleViewControls.readLayout("x", "list"), "list");
  assert.equal(context.RabbitHoleViewControls.readLayout("x"), "cards");
  const select = { value: "", options: [{ value: "original" }, { value: "title" }], listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } };
  const seen = [];
  store.set("s", "title");
  context.RabbitHoleViewControls.bindSort(select, "s", (v) => seen.push(v));
  assert.equal(select.value, "title");
  select.value = "original"; select.listeners.change();
  assert.equal(store.get("s"), "original");
  assert.deepEqual(seen, ["original"]);
  store.set("s2", "bogus");
  const other = { value: "", options: [{ value: "original" }], addEventListener() {} };
  context.RabbitHoleViewControls.bindSort(other, "s2", () => {});
  assert.equal(other.value, "original");
});

test("Standby, Beatport and TIDAL mixes each get Sort, and Beatport and TIDAL mixes the shared switch, in their header", () => {
  assert.match(html, /<label class="viewSort">Sort<select id="standbySort"><option value="original">Rank<\/option><option value="title">Title<\/option><option value="artist">Artist<\/option><option value="longest">Longest First<\/option><\/select><\/label>/);
  assert.match(html, /<label class="viewSort">Sort<select id="beatportChartSort"><option value="original">Chart Position<\/option><option value="title">Title<\/option><option value="artist">Artist<\/option><option value="bpm">BPM<\/option><\/select><\/label>/);
  assert.match(html, /<label class="viewSort">Sort<select id="tidalMixSort"><option value="original">Original Order<\/option><option value="title">Name A-Z<\/option><\/select><\/label>/);
  assert.doesNotMatch(app, /rabbitHole\.layout\.standby/, "Standby tracks carry no cover, so there is no Thumbnails view to switch to");
  assert.match(app, /\$\("#beatportChartsView \.beatportChartPanel \.resultActions"\)\?\.append\(window\.RabbitHoleViewControls\.layoutSwitch\(\{ key: "rabbitHole\.layout\.beatport", name: "Track", defaultLayout: "list",/);
  assert.match(app, /\$\("#tidalView \.tidalMixHero \.resultActions"\)\?\.append\(window\.RabbitHoleViewControls\.layoutSwitch\(\{ key: "rabbitHole\.layout\.tidalMixes", name: "Mix",/);
  assert.match(app, /sortedTrackEntries\(state\.standbyTracks, standbySort\)\.map\(\(entry\) => standbyTrackHtml\(entry\.track, entry\.index\)\)/);
  assert.match(app, /sortedTrackEntries\(list, beatportSort\)\.map\(\(entry\) => beatportChartTrackHtml\(entry\.track\)\)/);
});

test("thumbnail and list layouts exist for Beatport and TIDAL mixes, and Standby stays a list", () => {
  assert.doesNotMatch(css, /standbyCardsView|\.standbyArt/);
  assert.match(css, /\.beatportCardsView \.beatportChartTracks \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(180px, 1fr\)\);/);
  assert.match(css, /\.tidalMixListView \.tidalMixCard \{[^}]*grid-template-columns: 56px minmax\(0, 1fr\) auto;/);
});

test("every button, label, option and fold title on the Discover pages is Title Case", () => {
  const small = new Set(["a", "an", "and", "or", "of", "to", "the", "in", "on", "for", "by", "with"]);
  const offenders = [];
  for (const id of ["discoverView", "standbyView", "beatportChartsView", "tidalView"]) {
    const start = html.indexOf(`id="${id}"`);
    assert.ok(start >= 0, id);
    const next = html.indexOf("\n      <section id=", start + 10);
    const block = html.slice(start, next < 0 ? html.indexOf("</main>", start) : next);
    for (const match of block.matchAll(/<(button|label|option|summary)\b[^>]*>([^<]{2,80})</g)) {
      const words = match[2].trim().split(/\s+/);
      const bad = words.some((word, index) => /^[a-z]/.test(word) && (index === 0 || !small.has(word)));
      if (bad) offenders.push(`${id}: ${match[2].trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("TIDAL mix card actions are Title Case and stay on one line in List", () => {
  assert.match(app, />Use as Prompt<\/button>/);
  assert.match(app, />Remove Pin<\/button>/);
  assert.doesNotMatch(app, /"Remove pin"|"Use as prompt"/);
  assert.match(css, /\.tidalMixListView \.tidalMixActions :is\(button, \.buttonLink\) \{\s*white-space: nowrap;/);
});
