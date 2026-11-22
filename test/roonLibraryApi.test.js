"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRoonLibraryApi } = require("../src/roonLibraryApi");

function harness({ deepRoon = {}, roon = {}, body = {}, fetchImpl, clock } = {}) {
  const calls = [];
  const replies = [];
  const client = {
    enabled: true,
    async call(name, args) {
      calls.push({ name, args });
      if (deepRoon[name]) return deepRoon[name](args);
      throw new Error(`unexpected ${name}`);
    }
  };
  const api = createRoonLibraryApi({ deepRoon: client, roon, readJson: async () => body,
    sendJson: (res, status, payload) => replies.push({ status, payload }), fetchImpl, clock });
  const get = (path) => api.handle({ method: "GET" }, {}, new URL(`http://rh.test${path}`));
  const post = (path) => api.handle({ method: "POST" }, {}, new URL(`http://rh.test${path}`));
  return { api, calls, replies, get, post };
}

const row = { key: "1287727", title: "Silk Degrees", artist: "Boz Scaggs", format: "FLAC 44/16", year: 1976,
  image: "uhuoaaaa", image_url: "http://192.168.60.10:9330/image/uhuoaaaa.jpg" };

test("only the known Focus filters reach Deep Roon, typed, and a decade becomes a year range", async () => {
  const h = harness({ deepRoon: { roon_library: () => ({ total: 1, rows: [row] }) } });
  await h.get("/api/roon-library/albums?storage=Hi-Res&genre=Jazz&decade=1970&min_stars=4.5&hires=true&identified=false&not_played_within_days=90&sort=added&offset=50&evil=1&confirm=true");
  assert.deepEqual(h.calls[0], { name: "roon_library", args: {
    genre: "Jazz", storage: "Hi-Res", year_from: 1970, year_to: 1979, min_stars: 4.5, hires: true, identified: false,
    not_played_within_days: 90, sort: "added", offset: 50, limit: 60 } });
});

test("album covers are served through Rabbit Hole, never as a link to the Roon Core", async () => {
  const h = harness({ deepRoon: { roon_library: () => ({ total: 1, rows: [row] }) } });
  await h.get("/api/roon-library/albums");
  const album = h.replies[0].payload.albums[0];
  assert.equal(album.image, "/api/roon-library/image/uhuoaaaa");
  assert.equal(JSON.stringify(h.replies[0].payload).includes("192.168.60.10"), false);
});

test("the cover proxy only fetches image ids from the Core it learned and refuses anything else", async () => {
  const fetched = [];
  const h = harness({ deepRoon: { roon_library: () => ({ total: 1, rows: [row] }) },
    fetchImpl: async (url) => { fetched.push(String(url)); return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 2])); } });
  const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
  await h.api.handle({ method: "GET" }, res, new URL("http://rh.test/api/roon-library/image/uhuoaaaa"));
  assert.equal(h.replies.at(-1).status, 404);
  await h.get("/api/roon-library/albums");
  await h.api.handle({ method: "GET" }, res, new URL("http://rh.test/api/roon-library/image/uhuoaaaa"));
  assert.equal(res.status, 200);
  assert.deepEqual(fetched, ["http://192.168.60.10:9330/image/uhuoaaaa.jpg"]);
  await h.api.handle({ method: "GET" }, res, new URL("http://rh.test/api/roon-library/image/..%2F..%2Fapi"));
  assert.equal(h.replies.at(-1).status, 404);
  assert.equal(fetched.length, 1);
});

test("play takes the album's title and artists from Roon itself, not from what the browser sent", async () => {
  const played = [];
  const h = harness({
    body: { key: "1287727", zoneId: "zone-1", action: "queue", title: "Something Else", artists: ["Someone"] },
    deepRoon: { roon_album: ({ key }) => ({ album: { ...row, key }, artists: [{ key: "9", name: "Boz Scaggs" }, { key: "10", name: "Various Artists" }] }) },
    roon: { playLibraryAlbum: async (album, zoneId, action) => { played.push({ album, zoneId, action }); return { success: true, action: "Queue" }; } }
  });
  await h.post("/api/roon-library/play");
  assert.deepEqual(played, [{ album: { title: "Silk Degrees", artists: ["Boz Scaggs", "Various Artists"] }, zoneId: "zone-1", action: "queue" }]);
  assert.deepEqual(h.calls, [{ name: "roon_album", args: { key: "1287727" } }]);
  assert.equal(h.replies[0].status, 200);
});

test("a refused or failed play is a 409 with Roon's reason, and an unknown action never reaches Roon", async () => {
  const h = harness({
    body: { key: "1", zoneId: "zone-1", action: "play" },
    deepRoon: { roon_album: () => ({ album: row, artists: [] }) },
    roon: { playLibraryAlbum: async () => ({ success: false, reason: "2 albums in your Roon library are called \"Silk Degrees\"" }) }
  });
  await h.post("/api/roon-library/play");
  assert.equal(h.replies[0].status, 409);
  assert.match(h.replies[0].payload.error, /2 albums/);
  const bad = harness({ body: { key: "1", zoneId: "zone-1", action: "delete" }, roon: { playLibraryAlbum: async () => assert.fail("must not play") } });
  await bad.post("/api/roon-library/play");
  assert.equal(bad.replies[0].status, 400);
  assert.deepEqual(bad.calls, []);
});

test("when Deep Roon is not set up the tab says so with a 503 instead of an empty library", async () => {
  const api = createRoonLibraryApi({ deepRoon: { enabled: false, call: async () => assert.fail("no call") }, roon: {}, readJson: async () => ({}),
    sendJson: (res, status, payload) => { res.status = status; res.payload = payload; } });
  const res = {};
  await api.handle({ method: "GET" }, res, new URL("http://rh.test/api/roon-library/albums"));
  assert.equal(res.status, 503);
  assert.match(res.payload.error, /DEEP_ROON_URL/);
});

test("a cover the Core sends without a Content-Type is served when its bytes are a JPEG or PNG, and anything else is refused", async () => {
  const bodies = { aaaa: [0xff, 0xd8, 0xff, 0xe0, 1], bbbb: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], cccc: [0x3c, 0x68, 0x74, 0x6d, 0x6c] };
  const h = harness({ deepRoon: { roon_library: () => ({ total: 1, rows: [row] }) },
    fetchImpl: async (url) => new Response(new Uint8Array(bodies[String(url).match(/image\/(\w+)\.jpg/)[1]])) });
  await h.get("/api/roon-library/albums");
  const served = {};
  for (const id of Object.keys(bodies)) {
    const res = { writeHead(status, headers) { served[id] = [status, headers["Content-Type"]]; }, end() {} };
    await h.api.handle({ method: "GET" }, res, new URL(`http://rh.test/api/roon-library/image/${id}`));
  }
  assert.deepEqual(served, { aaaa: [200, "image/jpeg"], bbbb: [200, "image/png"] });
  assert.equal(h.replies.at(-1).status, 404);
});

test("the Focus answer carries every Roon storage location by name with its album count, for the Library drop-down", async () => {
  const storage = [{ name: "Lossless", albums: 2224 }, { name: "Hi-Res", albums: 179 }, { name: "TIDAL Library", albums: 82 }];
  const h = harness({ deepRoon: { roon_focus: () => ({ total_albums: 3279, genres: [], decades: [], stars: [], storage }) } });
  await h.get("/api/roon-library/focus");
  assert.deepEqual(h.replies[0].payload.libraries, storage);
});

const img = (id) => `http://192.168.60.10:9330/image/${id}.jpg`;

test("Recently Played lists each library album once, newest first, and leaves out streams with no album key", async () => {
  const h = harness({ deepRoon: { roon_history: () => ({ total: 4, plays: [
    { at: "2026-11-22 15:07", title: "Nitro Dub", artist: "Stargarden", album: "Ambient Excursions", album_key: "857135", image_url: img("sjygaaaa") },
    { at: "2026-11-22 15:00", title: "Chenrezig", artist: "Stargarden", album: "Ambient Excursions", album_key: "857135", image_url: img("sjygaaaa") },
    { at: "2026-11-22 14:00", title: "A Stream", artist: "Someone", album: "Only On TIDAL" },
    { at: "2026-11-21 22:02", title: "Blackest Eyes", artist: "Porcupine Tree", album: "In Absentia", album_key: "106799", image_url: img("jeibaaaa") }
  ] }) } });
  await h.get("/api/roon-library/view/recent");
  assert.deepEqual(h.calls, [{ name: "roon_history", args: { limit: 500 } }]);
  const { sections } = h.replies[0].payload;
  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0].albums.map((a) => [a.key, a.title, a.artist, a.lastPlayed, a.image]), [
    ["857135", "Ambient Excursions", "Stargarden", "2026-11-22 15:07", "/api/roon-library/image/sjygaaaa"],
    ["106799", "In Absentia", "Porcupine Tree", "2026-11-21 22:02", "/api/roon-library/image/jeibaaaa"]
  ]);
});

test("Most Played keeps Roon's play counts and finds each album in the library by its exact title and artist", async () => {
  const h = harness({ deepRoon: {
    roon_top: () => ({ from: "2024-12-27 09:21", rows: [
      { plays: 83, album: "In Absentia", artist: "Porcupine Tree", last_played: "2026-11-21 22:02" },
      { plays: 70, album: "Gone Album", artist: "Nobody", last_played: "2026-07-16 16:33" }
    ] }),
    roon_library: (args) => ({ rows: args.text === "In Absentia"
      ? [{ key: "999", title: "In Absentia (Deluxe)", artist: "Porcupine Tree" }, { key: "106799", title: "in absentia", artist: "Porcupine Tree", image_url: img("jeibaaaa") }]
      : [] })
  } });
  await h.get("/api/roon-library/view/top");
  assert.deepEqual(h.calls[0], { name: "roon_top", args: { what: "albums", limit: 30 } });
  assert.deepEqual(h.calls[1], { name: "roon_library", args: { text: "In Absentia", limit: 20 } });
  const [first, second] = h.replies[0].payload.sections[0].albums;
  assert.deepEqual([first.key, first.plays, first.inLibrary, first.image], ["106799", 83, true, "/api/roon-library/image/jeibaaaa"]);
  assert.deepEqual([second.key, second.title, second.plays, second.inLibrary], ["", "Gone Album", 70, false]);
  assert.equal(h.replies[0].payload.since, "2024-12-27 09:21");
});

test("Most Played is remembered for ten minutes so the library is not searched on every visit", async () => {
  let now = 0;
  const h = harness({ deepRoon: { roon_top: () => ({ rows: [{ plays: 3, album: "X", artist: "Y" }] }), roon_library: () => ({ rows: [] }) }, clock: () => now });
  await h.get("/api/roon-library/view/top");
  now = 9 * 60 * 1000;
  await h.get("/api/roon-library/view/top");
  assert.equal(h.calls.filter((c) => c.name === "roon_top").length, 1);
  now = 11 * 60 * 1000;
  await h.get("/api/roon-library/view/top");
  assert.equal(h.calls.filter((c) => c.name === "roon_top").length, 2);
});

test("Daily Picks come back as Roon's boxes, titled by why Roon picked them, with only library albums playable", async () => {
  const h = harness({ deepRoon: { roon_daily_picks: () => ({ day: "2026-11-22", boxes: [
    { reason: "new_release", rows: [{ key: "13215910", title: "Blue Planet III", artist: "Hans Zimmer", year: 2026, format: "FLAC 48kHz 24bit", image_url: img("xqyoaaaa") }],
      because_you_played: { key: "13215910", title: "Blue Planet III" } },
    { reason: "all_time", rows: [{ key: "72495", title: "Playing the Angel", artist: "Depeche Mode", in_library: true, image_url: img("ouroaaaa") }],
      because_you_played: { key: "1269039", title: "Hourglass", artist: "Dave Gahan" } },
    { reason: "recent", rows: [] }
  ] }) } });
  await h.get("/api/roon-library/view/picks");
  assert.deepEqual(h.calls, [{ name: "roon_daily_picks", args: { limit: 12 } }]);
  const { day, sections } = h.replies[0].payload;
  assert.equal(day, "2026-11-22");
  assert.deepEqual(sections.map((s) => s.title), ["New Releases", "Because You Played Hourglass"]);
  assert.deepEqual(sections.map((s) => s.albums.map((a) => [a.key, a.inLibrary])), [[["13215910", false]], [["72495", true]]]);
});

test("an unknown library view is refused without calling Deep Roon", async () => {
  const h = harness();
  await h.get("/api/roon-library/view/roon_control");
  assert.equal(h.replies[0].status, 404);
  assert.equal(h.calls.length, 0);
});
