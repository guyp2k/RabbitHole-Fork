"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  RadioMetadataResolver,
  chooseTidalTrack
} = require("../src/radioMetadataResolver");

const COVER_UUID = "12345678-abcd-4321-9000-123456789abc";

test("artist-qualified radio lookup does not create title-only catalog searches", () => {
  const resolver = new RadioMetadataResolver();
  const queries = resolver.createSearchQueries({
    artist: "Abity",
    title: "Lonely (Original Mix)"
  });

  assert.equal(queries.includes("Lonely (Original Mix)"), false);
  assert.equal(queries.includes("Lonely"), false);
  assert.ok(queries.some((query) => /abity/i.test(query)));
});

test("TIDAL candidate selection rejects same-title wrong-artist radio artwork", () => {
  const searchJson = {
    tracks: {
      items: [{
        id: "1",
        title: "Lonely",
        duration: 240,
        artists: [{ name: "Akon" }],
        album: {
          title: "Trouble",
          cover: COVER_UUID
        }
      }]
    }
  };

  assert.equal(chooseTidalTrack(searchJson, {
    artist: "Abity",
    title: "Lonely (Original Mix)"
  }), null);

  const matched = chooseTidalTrack(searchJson, {
    artist: "Akon",
    title: "Lonely"
  });
  assert.equal(matched.album, "Trouble");
});

test("TIDAL candidate selection tolerates a small radio artist typo", () => {
  const searchJson = {
    tracks: {
      items: [{
        id: "2",
        title: "Xciter (Deestopia Remix)",
        duration: 418,
        artists: [{ name: "Orkidea" }],
        album: {
          title: "Xciter",
          cover: COVER_UUID
        }
      }]
    }
  };

  const matched = chooseTidalTrack(searchJson, {
    artist: "Orkidera",
    title: "Xciter (Deestopia Remix)"
  });

  assert.equal(matched.album, "Xciter");
  assert.match(matched.coverImage, /resources\.tidal\.com/);
});

test("TIDAL web scraping is skipped when radio lookup has an artist", async () => {
  let fetched = false;
  const resolver = new RadioMetadataResolver({
    fetchImpl: async () => {
      fetched = true;
      return { ok: true, text: async () => "" };
    }
  });

  const result = await resolver.searchTidalWeb({
    artist: "Abity",
    title: "Lonely (Original Mix)"
  }, "abity|lonely");

  assert.equal(result, null);
  assert.equal(fetched, false);
});

test("TIDAL detail fallback rejects album art when artist validation is missing", async () => {
  const resolver = new RadioMetadataResolver({
    tidalAccessToken: "token"
  });
  resolver.fetchTidalSearchJson = async (url) => {
    if (String(url).includes("/tracks/1")) {
      return {
        data: {
          id: "1",
          type: "tracks",
          attributes: { title: "Voyage" },
          relationships: {
            albums: { data: { id: "album-1", type: "albums" } }
          }
        },
        included: [{
          id: "album-1",
          type: "albums",
          attributes: { title: "Discovery" }
        }]
      };
    }
    return {};
  };
  resolver.fetchTidalAlbum = async () => ({
    data: {
      id: "album-1",
      type: "albums",
      attributes: { title: "Discovery", cover: COVER_UUID }
    }
  });
  resolver.fetchTidalAlbumCoverImage = async () => "https://resources.tidal.com/images/12/34/cover.jpg";

  const result = await resolver.lookupTidalTrackDetails({ id: "1", title: "Voyage" }, {
    artist: "Mode Apart",
    title: "Voyage (Original Mix)"
  });

  assert.equal(result, null);
});

test("radio metadata TIDAL circuit opens after fetch failures", async () => {
  let calls = 0;
  const resolver = new RadioMetadataResolver({
    tidalAccessToken: "token",
    tidalFailureThreshold: 1,
    tidalCircuitCooldownMs: 1000,
    fetchJson: async () => {
      calls += 1;
      const error = new Error("TIDAL API lookup timed out after 1s");
      error.code = "ETIMEDOUT";
      throw error;
    }
  });

  await assert.rejects(
    () => resolver.fetchTidalSearchJson("https://openapi.tidal.com/v2/searchResults/test/relationships/tracks"),
    /timed out/
  );
  assert.equal(resolver.status().tidalCircuit.state, "open");

  await assert.rejects(
    () => resolver.fetchTidalSearchJson("https://openapi.tidal.com/v2/searchResults/test-2/relationships/tracks"),
    /temporarily unavailable/
  );
  assert.equal(calls, 1);
});

test("live MusicBrainz enrichment prefers asynchronous local search", async () => {
  const expected = [{ id: "local-async", title: "Strobe" }];
  const resolver = new RadioMetadataResolver({
    musicBrainzIndex: {
      searchRecordings() { throw new Error("Synchronous scan would block Roon"); },
      async searchRecordingsAsync(track) { assert.equal(track.title, "Strobe"); return expected; }
    },
    musicBrainzPublicFallback: false
  });
  assert.deepEqual(await resolver.searchRecordings({ title: "Strobe" }), expected);
});

test("MusicBrainz recording search uses local index before public fallback", async () => {
  let publicCalls = 0;
  const resolver = new RadioMetadataResolver({
    musicBrainzIndex: {
      searchRecordings: () => [{ id: "local", title: "U", "artist-credit": [{ artist: { name: "Avoure" } }] }],
      status: () => ({ enabled: true, available: true })
    },
    fetchJson: async () => {
      publicCalls += 1;
      return { recordings: [{ id: "public" }] };
    }
  });

  const rows = await resolver.searchRecordings({ artist: "Avoure", title: "U" });
  assert.equal(rows[0].id, "local");
  assert.equal(publicCalls, 0);
  assert.equal(resolver.status().musicBrainzLocal.available, true);
});

test("MusicBrainz recording search falls back to public API after local miss", async () => {
  let publicCalls = 0;
  const resolver = new RadioMetadataResolver({
    musicBrainzIndex: {
      searchRecordings: () => [],
      status: () => ({ enabled: true, available: true })
    },
    fetchJson: async () => {
      publicCalls += 1;
      return { recordings: [{ id: "public" }] };
    }
  });

  const rows = await resolver.searchRecordings({ artist: "Avoure", title: "U" });
  assert.equal(rows[0].id, "public");
  assert.equal(publicCalls, 1);
});

test("MusicBrainz public fallback can be disabled", async () => {
  let publicCalls = 0;
  const resolver = new RadioMetadataResolver({
    musicBrainzIndex: { searchRecordings: () => [] },
    musicBrainzPublicFallback: false,
    fetchJson: async () => {
      publicCalls += 1;
      return { recordings: [{ id: "public" }] };
    }
  });

  const rows = await resolver.searchRecordings({ artist: "Avoure", title: "U" });
  assert.deepEqual(rows, []);
  assert.equal(publicCalls, 0);
});

async function tidalSearchUrls(options) {
  const resolver = new RadioMetadataResolver({ tidalArtworkEnabled: true, ...options });
  const urls = [];
  resolver.fetchTidalSearchJson = async (url) => { urls.push(String(url)); return {}; };
  const result = await resolver.searchTidal({ artist: "The Temper Trap", title: "These Arms" }, "probe");
  return { result, urls };
}

test("with a client ID and secret, TIDAL's old v1 search is never called, because it refuses client-credential tokens with 401", async () => {
  const { result, urls } = await tidalSearchUrls({ tidalClientId: "id", tidalClientSecret: "secret" });
  assert.equal(result, null);
  assert.ok(urls.some((url) => url.startsWith("https://openapi.tidal.com/v2/")));
  assert.deepEqual(urls.filter((url) => url.startsWith("https://api.tidal.com/v1/")), []);
});

test("with only a pasted TIDAL access token, the old v1 search is still tried after the current API finds nothing", async () => {
  const { urls } = await tidalSearchUrls({ tidalAccessToken: "pasted-token" });
  assert.ok(urls.some((url) => url.startsWith("https://api.tidal.com/v1/search/tracks")));
});

test("when TIDAL's track details confirm the title and artist but carry no cover, the album's cover is fetched", async () => {
  const resolver = new RadioMetadataResolver({ tidalClientId: "id", tidalClientSecret: "secret" });
  resolver.fetchTidalSearchJson = async () => ({
    data: { id: "512594480", type: "tracks", attributes: { title: "These Arms" },
      relationships: { albums: { data: [{ id: "album-9", type: "albums" }] }, artists: { data: [{ id: "artist-1", type: "artists" }] } } },
    included: [
      { id: "album-9", type: "albums", attributes: { title: "These Arms" } },
      { id: "artist-1", type: "artists", attributes: { name: "The Temper Trap" } }
    ]
  });
  const albums = [];
  resolver.fetchTidalAlbum = async (id) => { albums.push(id); return { data: { id, type: "albums", attributes: { title: "These Arms" } } }; };
  resolver.fetchTidalAlbumCoverImage = async () => "https://resources.tidal.com/images/aa/bb/1280x1280.jpg";

  const result = await resolver.lookupTidalTrackDetails({ id: "512594480", title: "These Arms" }, { artist: "The Temper Trap", title: "These Arms" });

  assert.deepEqual(albums, ["album-9"]);
  assert.equal(result.coverImage, "https://resources.tidal.com/images/aa/bb/1280x1280.jpg");
  assert.equal(result.album, "These Arms");
});

test("TIDAL track details by a different artist still get no album cover", async () => {
  const resolver = new RadioMetadataResolver({ tidalClientId: "id", tidalClientSecret: "secret" });
  resolver.fetchTidalSearchJson = async () => ({
    data: { id: "1", type: "tracks", attributes: { title: "These Arms" },
      relationships: { albums: { data: [{ id: "album-1", type: "albums" }] }, artists: { data: [{ id: "artist-2", type: "artists" }] } } },
    included: [{ id: "artist-2", type: "artists", attributes: { name: "Someone Else" } }]
  });
  let fetched = 0;
  resolver.fetchTidalAlbum = async () => { fetched += 1; return {}; };
  resolver.fetchTidalAlbumCoverImage = async () => "https://resources.tidal.com/images/x/1280x1280.jpg";

  assert.equal(await resolver.lookupTidalTrackDetails({ id: "1", title: "These Arms" }, { artist: "The Temper Trap", title: "These Arms" }), null);
  assert.equal(fetched, 0);
});
