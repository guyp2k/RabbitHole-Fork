"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRadioParadise, isRadioParadiseZone } = require("../src/radioParadise");

const exact = (a, b) => a.artist.toLowerCase() === String(b.artist).toLowerCase() && a.title.toLowerCase() === String(b.title).toLowerCase();

function api(nowPlaying, calls = []) {
  return async (url) => {
    calls.push(url);
    if (url.includes("/list_chan")) return { response: { ok: true }, body: Object.keys(nowPlaying).map((chan) => ({ chan, title: `Chan ${chan}` })) };
    const chan = new URL(url).searchParams.get("chan");
    return { response: { ok: true }, body: nowPlaying[chan] };
  };
}

test("only a Roon station named Radio Paradise counts as Radio Paradise", () => {
  assert.equal(isRadioParadiseZone({ now_playing: { two_line: { line1: "Radio Paradise: Main Mix", line2: "A - T" } } }), true);
  assert.equal(isRadioParadiseZone({ now_playing: { three_line: { line1: "radio paradise: Mellow Mix" } } }), true);
  assert.equal(isRadioParadiseZone({ now_playing: { two_line: { line1: "KEXP 90.3", line2: "Radio Paradise - Cover" } } }), false);
  assert.equal(isRadioParadiseZone({}), false);
});

test("the cover comes from whichever Radio Paradise channel is playing that exact artist and title", async () => {
  const lookup = createRadioParadise({ matches: exact, fetchJsonWithTimeout: api({
    0: { artist: "Neil Young", title: "Helpless", album: "Harvest Moon", cover: "https://img.radioparadise.com/covers/l/10239.jpg" },
    3: { artist: "MO3 & Morray", title: "Fragile Hearts", album: "Fragile Hearts", cover: "https://img.radioparadise.com/covers/l/24126.jpg" }
  }) });
  assert.deepEqual(await lookup.lookup({ artist: "MO3 & Morray", title: "Fragile Hearts" }), {
    artist: "MO3 & Morray", title: "Fragile Hearts", album: "Fragile Hearts", albumArtUrl: "https://img.radioparadise.com/covers/l/24126.jpg", source: "paradise"
  });
  assert.equal(await lookup.lookup({ artist: "Somebody", title: "Else" }), null);
});

test("a cover that is not one of Radio Paradise's own image files is refused", async () => {
  const lookup = createRadioParadise({ matches: exact, fetchJsonWithTimeout: api({
    0: { artist: "A", title: "T", cover: "https://evil.example/covers/l/1.jpg" },
    1: { artist: "A", title: "T", cover: "http://img.radioparadise.com/covers/l/1.jpg" }
  }) });
  assert.equal(await lookup.lookup({ artist: "A", title: "T" }), null);
});

test("the channel list is read once a day and each channel's song at most every 20 seconds", async () => {
  let now = 0;
  const calls = [];
  const lookup = createRadioParadise({ matches: exact, clock: () => now, fetchJsonWithTimeout: api({ 0: { artist: "A", title: "T", cover: "https://img.radioparadise.com/covers/l/1.jpg" } }, calls) });
  await lookup.lookup({ artist: "A", title: "T" });
  now = 19_000;
  await lookup.lookup({ artist: "A", title: "T" });
  assert.deepEqual(calls.map((url) => url.replace(/^https:\/\/api\.radioparadise\.com\/api\//, "")), ["list_chan?C_user_id=1&ver=2", "now_playing?chan=0"]);
  now = 21_000;
  await lookup.lookup({ artist: "A", title: "T" });
  assert.equal(calls.filter((url) => url.includes("now_playing")).length, 2);
  assert.equal(calls.filter((url) => url.includes("list_chan")).length, 1);
});

test("Radio Paradise being unreachable means no cover, not an error", async () => {
  const lookup = createRadioParadise({ matches: exact, fetchJsonWithTimeout: async () => { throw new Error("offline"); } });
  assert.equal(await lookup.lookup({ artist: "A", title: "T" }), null);
});
