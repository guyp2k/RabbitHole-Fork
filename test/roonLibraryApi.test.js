"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRoonLibraryApi } = require("../src/roonLibraryApi");

function harness({ deepRoon = {}, roon = {}, body = {}, fetchImpl } = {}) {
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
    sendJson: (res, status, payload) => replies.push({ status, payload }), fetchImpl });
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
