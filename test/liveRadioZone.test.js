"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const fn = (name) => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  return app.slice(start, app.indexOf("\n}\n", start) + 2);
};
const context = {};
vm.runInNewContext(["zonePlaybackState", "zonePlaybackStopped", "currentZoneNowPlaying", "isLiveRadioZone"].map(fn).join("\n") + "\nthis.isLiveRadioZone = isLiveRadioZone;", context);
const { isLiveRadioZone } = context;

const zone = (line1, extra = {}, now = {}) => ({ display_name: "HQPd", state: "playing", is_seek_allowed: false, ...extra,
  now_playing: { two_line: { line1, line2: "Chris Coco - Letter From Erika (Electric Zeus Afterhours Mix)" }, ...now } });

test("a stream with no length that Rabbit Hole's server already parsed as radio is live radio, whatever the station is called", () => {
  assert.equal(isLiveRadioZone(zone("SomaFM: Groove Salad", {}, { radio_lookup: { artist: "Chris Coco", title: "Letter From Erika" } })), true);
});

test("station names with radio words are still live radio without the server's parse", () => {
  assert.equal(isLiveRadioZone(zone("Radio Paradise: Main Mix")), true);
});

test("a track with a length, or a seekable one, is never live radio even when the server parsed it like radio", () => {
  const lookup = { radio_lookup: { artist: "A", title: "B" } };
  assert.equal(isLiveRadioZone(zone("SomaFM: Groove Salad", {}, { ...lookup, length: 404 })), false);
  assert.equal(isLiveRadioZone(zone("SomaFM: Groove Salad", { is_seek_allowed: true }, lookup)), false);
  assert.equal(isLiveRadioZone(zone("SomaFM: Groove Salad", { state: "stopped" }, lookup)), false);
});
