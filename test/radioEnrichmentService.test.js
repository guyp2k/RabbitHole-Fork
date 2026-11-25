"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRadioEnrichmentService } = require("../src/radioEnrichmentService");

function createService(overrides = {}) {
  const keyFor = overrides.radioEnrichmentKey || ((lookup = {}) => lookup?.artist && lookup?.title
    ? `${lookup.artist.toLowerCase()}|${lookup.title.toLowerCase()}`
    : "");
  return createRadioEnrichmentService({
    cleanArtworkUrl: overrides.cleanArtworkUrl || ((value = "") => String(value || "").trim()),
    cleanHttpUrl: overrides.cleanHttpUrl || ((value = "") => String(value || "").trim()),
    cleanRadioText: overrides.cleanRadioText || ((value = "") => String(value || "").replace(/\s+/g, " ").trim()),
    config: overrides.config || {
      radioMetadata: {
        enabled: true,
        roonPresenceNowStateUrl: "",
        roonPresenceTimeoutMs: 1200
      }
    },
    fetchJsonWithTimeout: overrides.fetchJsonWithTimeout || (async () => ({ response: { ok: false }, body: null })),
    parseRoonPresenceNowState: overrides.parseRoonPresenceNowState || (() => null),
    radioEnrichmentHasArtwork: overrides.radioEnrichmentHasArtwork || ((entry = {}) => Boolean(entry.imageUrl || entry.albumArtUrl)),
    radioEnrichmentKey: keyFor,
    radioEnrichmentResultKey: overrides.radioEnrichmentResultKey || ((entry = {}) => entry.radioTrackKey || entry.key || ""),
    radioMetadataResolver: overrides.radioMetadataResolver || {
      lookup: async () => null
    },
    radioTrackFromZone: overrides.radioTrackFromZone || ((zone = {}) => zone.lookup || null),
    scheduleBroadcast: overrides.scheduleBroadcast || (() => {}),
    tidal: overrides.tidal || {
      isConfigured: () => false,
      verify: async () => null
    },
    radioParadise: overrides.radioParadise,
    tidalEnrichmentMatches: overrides.tidalEnrichmentMatches || ((lookup = {}, candidate = {}) => (
      keyFor(lookup) === keyFor(candidate)
    ))
  });
}

test("radioMetadataToEnrichment requires exact metadata when artist and title are known", () => {
  const service = createService();
  const loose = service.radioMetadataToEnrichment(
    { artist: "A", title: "T" },
    { artist: "Other", title: "T", albumArtUrl: "http://image" },
    null
  );
  const exact = service.radioMetadataToEnrichment(
    { artist: "A", title: "T" },
    { artist: "A", title: "T", album: "Album", albumArtUrl: "http://image", source: "discogs" },
    null
  );

  assert.equal(loose, null);
  assert.equal(exact.key, "a|t");
  assert.equal(exact.imageUrl, "http://image");
  assert.equal(exact.source, "radio-discogs");
});

test("resolveRadioEnrichment prefers matching RoonPresence artwork mirror", async () => {
  const service = createService({
    config: {
      radioMetadata: {
        enabled: true,
        roonPresenceNowStateUrl: "http://presence.local/now",
        roonPresenceTimeoutMs: 1200
      }
    },
    fetchJsonWithTimeout: async () => ({
      response: { ok: true },
      body: { ignored: true }
    }),
    parseRoonPresenceNowState: () => ({
      key: "a|t",
      albumArtUrl: "http://presence/art.jpg",
      source: "roon-presence"
    }),
    radioMetadataResolver: {
      lookup: async () => {
        throw new Error("metadata lookup should not run after RoonPresence hit");
      }
    }
  });

  const result = await service.resolveRadioEnrichment({ artist: "A", title: "T" }, "a|t");

  assert.equal(result.imageUrl, "http://presence/art.jpg");
  assert.equal(result.source, "radio-roon-presence");
});

test("scheduleRadioEnrichment caches results and later attaches them to playback state", async () => {
  let broadcasts = 0;
  const service = createService({
    radioMetadataResolver: {
      lookup: async () => ({
        artist: "A",
        title: "T",
        album: "Album",
        albumArtUrl: "http://image",
        source: "resolver"
      })
    },
    scheduleBroadcast: () => {
      broadcasts += 1;
    }
  });
  const state = { zones: [{ lookup: { artist: "A", title: "T" }, now_playing: {} }] };

  service.scheduleRadioEnrichment(state);
  await new Promise((resolve) => setImmediate(resolve));
  const enriched = service.attachRadioEnrichment(state);

  assert.equal(broadcasts, 1);
  assert.equal(enriched.zones[0].now_playing.radio_lookup.artist, "A");
  assert.equal(enriched.zones[0].now_playing.radio_enrichment.imageUrl, "http://image");
});

test("scheduleRadioEnrichment does nothing when metadata and TIDAL are disabled", async () => {
  let lookups = 0;
  const service = createService({
    config: {
      radioMetadata: {
        enabled: false,
        roonPresenceNowStateUrl: "",
        roonPresenceTimeoutMs: 1200
      }
    },
    radioMetadataResolver: {
      lookup: async () => {
        lookups += 1;
        return null;
      }
    },
    tidal: {
      isConfigured: () => false,
      verify: async () => {
        lookups += 1;
        return null;
      }
    }
  });

  service.scheduleRadioEnrichment({ zones: [{ lookup: { artist: "A", title: "T" } }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(lookups, 0);
});

const rpZone = (lookup) => ({ lookup, now_playing: { two_line: { line1: "Radio Paradise: Main Mix", line2: `${lookup.artist} - ${lookup.title}` } } });
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("a Radio Paradise station's own cover fills in when TIDAL and the metadata lookups find no artwork", async () => {
  const asked = [];
  const service = createService({
    tidal: { isConfigured: () => true, verify: async () => ({ artist: "MO3 & Morray", title: "Fragile Hearts", tidalUrl: "https://tidal.com/x" }) },
    radioParadise: { lookup: async (track) => { asked.push(track.title); return { artist: "MO3 & Morray", title: "Fragile Hearts", album: "Fragile Hearts", albumArtUrl: "https://img.radioparadise.com/covers/l/24126.jpg", source: "paradise" }; } }
  });
  const lookup = { artist: "MO3 & Morray", title: "Fragile Hearts" };
  service.scheduleRadioEnrichment({ zones: [rpZone(lookup)] });
  await settle(); await settle();
  const attached = service.attachRadioEnrichment({ zones: [rpZone(lookup)] }).zones[0].now_playing.radio_enrichment;
  assert.deepEqual(asked, ["Fragile Hearts"]);
  assert.equal(attached.imageUrl, "https://img.radioparadise.com/covers/l/24126.jpg");
  assert.equal(attached.source, "radio-paradise");
});

test("TIDAL's cover still wins on Radio Paradise, and other stations never ask Radio Paradise", async () => {
  const asked = [];
  const radioParadise = { lookup: async (track) => { asked.push(track.title); return { artist: track.artist, title: track.title, albumArtUrl: "https://img.radioparadise.com/covers/l/1.jpg" }; } };
  const tidal = { isConfigured: () => true, verify: async (lookup) => (lookup.title === "Has Art" ? { ...lookup, imageUrl: "https://resources.tidal.com/images/a/1280x1280.jpg" } : null) };
  const service = createService({ tidal, radioParadise });
  const withArt = { artist: "A", title: "Has Art" };
  const otherStation = { artist: "B", title: "No Art" };
  service.scheduleRadioEnrichment({ zones: [rpZone(withArt), { lookup: otherStation, now_playing: { two_line: { line1: "KEXP 90.3", line2: "B - No Art" } } }] });
  await settle(); await settle();
  const zones = service.attachRadioEnrichment({ zones: [rpZone(withArt), { lookup: otherStation, now_playing: {} }] }).zones;
  assert.equal(zones[0].now_playing.radio_enrichment.imageUrl, "https://resources.tidal.com/images/a/1280x1280.jpg");
  assert.deepEqual(asked, []);
});
