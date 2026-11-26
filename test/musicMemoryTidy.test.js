"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { MusicMemoryStore } = require("../src/musicMemoryStore");

const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
const server = fs.readFileSync(require.resolve("../src/server.js"), "utf8");

function store(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rh-music-memory-sort-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const memory = new MusicMemoryStore({ dbFile: path.join(dir, "m.sqlite"), logger: null });
  const tracks = [
    { tidalId: "1", artist: "Yello", title: "Waba Duba" },
    { tidalId: "2", artist: "alice in chains", title: "Rooster" },
    { tidalId: "3", artist: "Boris Blank", title: "electrified II" }
  ];
  for (const track of tracks) memory.rememberObservation(track, "queued");
  for (let i = 0; i < 3; i += 1) memory.rememberObservation(tracks[2], "now_playing");
  memory.rememberObservation(tracks[1], "now_playing");
  return memory;
}
const titles = (result) => result.tracks.map((track) => track.title);

test("Music Memory sorts on the server across every stored track, not just the page on screen", (t) => {
  const memory = store(t);
  assert.deepEqual(titles(memory.searchTracks({ sort: "title" })), ["electrified II", "Rooster", "Waba Duba"]);
  assert.deepEqual(titles(memory.searchTracks({ sort: "artist" })), ["Rooster", "electrified II", "Waba Duba"]);
  assert.deepEqual(titles(memory.searchTracks({ sort: "plays" })).slice(0, 2), ["electrified II", "Rooster"]);
  assert.equal(memory.searchTracks({ sort: "title", limit: 1, offset: 1 }).tracks[0].title, "Rooster");
});

test("an unknown sort falls back to most recently seen and never reaches the SQL", (t) => {
  const memory = store(t);
  assert.deepEqual(titles(memory.searchTracks({ sort: "title; DROP TABLE track_identity" })), titles(memory.searchTracks({})));
  assert.match(server, /sort: url\.searchParams\.get\("sort"\) \|\| "",/);
});

test("Music Memory explains itself, points to Database, and has Sort and the shared switch", () => {
  assert.match(html, /<h2 id="musicMemoryHeading">Music Memory<\/h2>\s*<p class="pageIntro">Every track Rabbit Hole has played, queued, discovered or looked up, with what it knows about each one and how you rated it\. Search it here; System &gt; Database has the full evidence behind it\.<\/p>/);
  assert.match(html, /<label class="viewSort">Sort<select id="musicMemorySort"><option value="recent">Recently Seen<\/option><option value="title">Title<\/option><option value="artist">Artist<\/option><option value="plays">Most Played<\/option><\/select><\/label>/);
  assert.match(app, /window\.RabbitHoleViewControls\.bindSort\(\$\("#musicMemorySort"\), "rabbitHole\.sort\.musicMemory", \(\) => refreshMusicMemory\(\)\)/);
  assert.match(app, /      sort: \$\("#musicMemorySort"\)\?\.value \|\| "recent",/);
  assert.match(app, /\$\("#musicMemorySearchForm"\)\?\.append\(window\.RabbitHoleViewControls\.layoutSwitch\(\{ key: "rabbitHole\.layout\.musicMemory", name: "Track",/);
  assert.match(css, /\.musicMemoryListView \.musicMemoryResults \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(html, /<option value="">All Beatport States<\/option>/);
  assert.match(html, /<option value="">All Feedback<\/option>/);
});
