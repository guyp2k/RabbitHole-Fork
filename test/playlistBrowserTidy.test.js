"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
const fn = (name) => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  return app.slice(start, app.indexOf("\n}\n", start) + 2);
};
const context = {};
vm.runInNewContext(["readPlaylistBrowserPrefs", "sortedPlaylistEntries"].map(fn).join("\n") + "\nthis.read = readPlaylistBrowserPrefs; this.sorted = sortedPlaylistEntries;", context);
const plain = (value) => JSON.parse(JSON.stringify(value));

const playlists = [
  { title: "70s Road Trip", itemCount: 100 },
  { title: "10 Years Gone - Zepp", itemCount: 34 },
  { title: "ambient Relaxation", itemCount: 196 },
  { title: "Afrika Shox", itemCount: 71 }
];
const order = (sort) => plain(context.sorted(playlists, sort)).map((entry) => [entry.playlist.title, entry.index]);

test("sorting keeps each playlist's original position, so Play, Queue and Delete still act on the playlist shown", () => {
  assert.deepEqual(order("original"), [["70s Road Trip", 0], ["10 Years Gone - Zepp", 1], ["ambient Relaxation", 2], ["Afrika Shox", 3]]);
  assert.deepEqual(order("name"), [["10 Years Gone - Zepp", 1], ["70s Road Trip", 0], ["Afrika Shox", 3], ["ambient Relaxation", 2]]);
  assert.deepEqual(order("name-desc"), [["ambient Relaxation", 2], ["Afrika Shox", 3], ["70s Road Trip", 0], ["10 Years Gone - Zepp", 1]]);
  assert.deepEqual(order("most"), [["ambient Relaxation", 2], ["70s Road Trip", 0], ["Afrika Shox", 3], ["10 Years Gone - Zepp", 1]]);
  assert.deepEqual(order("fewest"), [["10 Years Gone - Zepp", 1], ["Afrika Shox", 3], ["70s Road Trip", 0], ["ambient Relaxation", 2]]);
});

test("saved playlist folds and sorts are read back, and anything unknown falls back to open and original order", () => {
  assert.deepEqual(plain(context.read(null)), { folded: { tidal: false, roon: false }, sort: { tidal: "original", roon: "original" } });
  assert.deepEqual(plain(context.read(JSON.stringify({ folded: { tidal: true }, sort: { roon: "most", tidal: "bogus" } }))),
    { folded: { tidal: true, roon: false }, sort: { tidal: "original", roon: "most" } });
  assert.deepEqual(plain(context.read("{not json")), { folded: { tidal: false, roon: false }, sort: { tidal: "original", roon: "original" } });
});

test("the playlist sections are titled TIDAL Playlists and Roon Local Playlists, and each folds and sorts from its heading", () => {
  assert.match(app, /title: "TIDAL Playlists",/);
  assert.match(app, /title: "Roon Local Playlists",/);
  assert.match(app, /isTidal \? "TIDAL Playlist" : "Roon Local Playlist"/);
  assert.doesNotMatch(app, /"TIDAL playlists",|"Roon local playlists",/);
  assert.match(app, /data-playlist-fold="\$\{escapeHtml\(source\)\}" aria-expanded="\$\{String\(!folded\)\}" aria-controls="playlistBrowserItems-\$\{escapeHtml\(source\)\}"/);
  assert.match(app, /<select data-playlist-sort="\$\{escapeHtml\(source\)\}" aria-label="Sort \$\{escapeHtml\(title\)\}">/);
  assert.match(app, /localStorage\.setItem\(PLAYLIST_BROWSER_KEY, JSON\.stringify\(playlistBrowserPrefs\)\)/);
});

test("the shared switch's List choice turns the playlists into one row per playlist", () => {
  assert.match(app, /class="playlistBrowserCards\$\{playlistLayout === "list" \? " isList" : ""\}"/);
  assert.match(css, /\.playlistBrowserCards\.isList \.playlistBrowserCard \{[^}]*grid-template-areas: "art body actions";/);
  assert.match(css, /\.playlistBrowserItems\[hidden\] \{\s*display: none;/);
  assert.match(css, /#playlistView \.playlistBrowserFold \{[^}]*border: 0 !important;[^}]*background: none !important;/);
});
