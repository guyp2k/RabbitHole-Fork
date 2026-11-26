"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../public/viewControls.js"), "utf8");
const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const library = fs.readFileSync(require.resolve("../public/roonLibrary.js"), "utf8");
const lyrion = fs.readFileSync(require.resolve("../public/lyrion.js"), "utf8");
const styles = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
const libraryCss = fs.readFileSync(require.resolve("../public/roonLibrary.css"), "utf8");

function load(saved) {
  const store = new Map(saved ? [["k", saved]] : []);
  const made = [];
  const element = () => {
    const node = { children: [], dataset: {}, attributes: {}, listeners: {}, className: "", textContent: "", type: "",
      append(...nodes) { this.children.push(...nodes); },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name]; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      click() { this.listeners.click?.(); } };
    made.push(node);
    return node;
  };
  const context = { document: { createElement: element }, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } };
  context.window = context;
  vm.runInNewContext(source, context);
  return { controls: context.RabbitHoleViewControls, store };
}

test("every page's Thumbnails | List switch is the same control: two buttons, the saved choice pressed, a click saves and reports it", () => {
  const { controls, store } = load("list");
  const seen = [];
  const group = controls.layoutSwitch({ key: "k", name: "Queue", onChange: (layout) => seen.push(layout) });
  assert.equal(group.className, "viewSwitch");
  assert.equal(group.attributes["aria-label"], "Queue View");
  assert.deepEqual(group.children.map((b) => [b.textContent, b.dataset.layout, b.attributes["aria-pressed"]]), [["Thumbnails", "cards", "false"], ["List", "list", "true"]]);
  group.children[0].click();
  assert.deepEqual(seen, ["list", "cards"]);
  assert.equal(store.get("k"), "cards");
  assert.deepEqual(group.children.map((b) => b.attributes["aria-pressed"]), ["true", "false"]);
});

test("a page with nothing saved starts in thumbnails", () => {
  assert.equal(load(null).controls.readLayout("k"), "cards");
  assert.equal(load("bogus").controls.readLayout("k"), "cards");
});

test("Playlists, Library, Queue and Lyrion's Queue all mount the shared switch in their page header, and no page keeps its own", () => {
  assert.match(html, /<script src="\/viewControls\.js\?v=1"><\/script>\s*<script src="\/themePicker\.js/);
  assert.match(app, /\$\("#playlistView \.playlistHero \.resultActions"\)\?\.append\(window\.RabbitHoleViewControls\.layoutSwitch\(\{ key: "rabbitHole\.layout\.playlists", name: "Playlist",/);
  assert.match(app, /\$\("#queueView \.queueViewHeader"\)\?\.append\(window\.RabbitHoleViewControls\.layoutSwitch\(\{ key: "rabbitHole\.layout\.queue", name: "Queue",/);
  assert.match(library, /\$\("#roonLibraryView \.dbHeader"\)\?\.append\(window\.RabbitHoleViewControls\.layoutSwitch\(\{ key: "rabbitHole\.layout\.library", name: "Album",/);
  assert.match(lyrion, /queueHead\.querySelector\("\[data-lyrion-control='clear'\]"\)\.before\(window\.RabbitHoleViewControls\.layoutSwitch\(\{ key: "rabbitHole\.layout\.lyrionQueue", name: "Queue",/);
  assert.doesNotMatch(html, /playlistBrowserView|rlLayoutSwitch|data-rl-layout|data-playlist-view/);
  assert.doesNotMatch(app + library, /data-playlist-view|data-rl-layout|LAYOUT_KEY/);
  assert.doesNotMatch(styles + libraryCss, /\.playlistBrowserView|\.rlLayoutSwitch/);
});

test("one style for every switch and every Sort control", () => {
  assert.match(styles, /\.viewSwitch button\[aria-pressed="true"\] \{[^}]*border-color: var\(--accent\) !important;/);
  assert.match(styles, /\.viewSort \{[^}]*display: inline-flex;/);
  assert.match(app, /<label class="viewSort">Sort<select data-playlist-sort=/);
});

test("Queue thumbnails are cover cards with the position on the cover, for Roon and Lyrion alike", () => {
  assert.match(styles, /\.queueCardsView \.liveQueue ol \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(150px, 1fr\)\);/);
  assert.match(styles, /\.queueCardsView \.liveQueue \.queueArt \{[^}]*aspect-ratio: 1;/);
  assert.match(styles, /\.queueCardsView \.liveQueue \.queueItemPosition \{[^}]*position: absolute;/);
  assert.match(app, /\/api\/roon\/image\/\$\{encodeURIComponent\(item\.imageKey\)\}\?width=240&height=240/);
});
