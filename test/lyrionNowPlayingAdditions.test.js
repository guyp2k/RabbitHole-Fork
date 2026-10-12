"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { LyrionClient } = require("../src/lyrionClient");
const { createLyrionTrackMetadata } = require("../src/lyrionTrackMetadata");

const source = fs.readFileSync(require.resolve("../public/lyrion.js"), "utf8");
const rail = fs.readFileSync(require.resolve("../public/lyrionDiscoveryRail.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/lyrion.css"), "utf8");
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
const time = n => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
const rows = (...args) => {
  const context = { time };
  vm.runInNewContext(section("  function lyrionDetailRows(", "  function renderLyrionDetails("), context);
  return JSON.parse(JSON.stringify(context.lyrionDetailRows(...args)));
};
const localTrack = { id: 1, title: "Sorrow", artist: "David Gilmour", album: "Live at the Circus Maximus", duration: 655, year: "2017", genre: "", type: "flc", samplerate: "96000", samplesize: "24", bitrate: "", url: "file:///music/x.flac", "playlist index": 0 };
const client = new LyrionClient({ baseUrl: "http://lms.example:9000" });

test("the Lyrion track lookup returns the enrichment Roon uses: label, release date, genre, BPM and key", async () => {
  const asked = [];
  const enrichment = {
    beatport: { isConfigured: () => false },
    async lookupBeatport() { return null; },
    async enrich(track) { asked.push(track); return { status: "found", confidence: 98, label: "Columbia", releaseDate: "2017-09-29", releaseYear: 2017, genre: "Rock", bpm: 0, keyName: "", camelot: "", tidalUrl: "https://tidal.com/x" }; }
  };
  const lookup = createLyrionTrackMetadata(enrichment, () => 0);
  const result = await lookup({ title: "Sorrow", artist: "David Gilmour", album: "Live at the Circus Maximus", durationMs: 655000 });
  assert.deepEqual(result.details, { label: "Columbia", releaseDate: "2017-09-29", releaseYear: 2017, genre: "Rock" });
  assert.equal(result.beatportEnabled, false);
  assert.deepEqual(asked, [{ title: "Sorrow", artist: "David Gilmour", album: "Live at the Circus Maximus", durationMs: 655000 }]);
});

test("found details are kept for ten minutes, and an enrichment failure is not fatal", async () => {
  let now = 0, calls = 0, fail = false;
  const enrichment = { async lookupBeatport() { return null; }, async enrich() { calls++; if (fail) throw new Error("TIDAL down"); return { label: "L" }; } };
  const lookup = createLyrionTrackMetadata(enrichment, () => now);
  await lookup({ title: "T", artist: "A" });
  now = 590000; await lookup({ title: "T", artist: "A" });
  assert.equal(calls, 1);
  fail = true;
  assert.equal((await lookup({ title: "Other", artist: "A" })).details, null);
});

test("Now playing adds Label, the release date and BPM / Key from the enrichment, in Roon's order", () => {
  const track = client.track(localTrack);
  assert.deepEqual(rows(track, 655, null, { label: "Columbia", releaseDate: "2017-09-29", genre: "Rock", bpm: 120.4, keyName: "A Minor", camelot: "8A" }), [
    ["Track length", "10:55"], ["Released", "2017-09-29"], ["Label", "Columbia"], ["Genre", "Rock"],
    ["Format", "FLAC · 96 kHz / 24-bit", "Library file"], ["BPM / Key", "120 BPM • A Minor • 8A"]]);
});

test("the LMS genre and year win when the enrichment has none, and an empty enrichment adds nothing", () => {
  const track = client.track({ ...localTrack, genre: "Prog" });
  assert.deepEqual(rows(track, 655, null, {}).map(r => r[0]), ["Track length", "Released", "Genre", "Format"]);
  assert.equal(rows(track, 655, null, { genre: "Rock" }).find(r => r[0] === "Genre")[1], "Prog");
});

test("the rail reports the details for the track it looked up, so a late reply cannot label the next track", () => {
  assert.match(rail, /stage\.dispatchEvent\(new CustomEvent\('lyrion-track-details',\{detail:\{track:captured,details:result\.details\|\|null\}\}\)\);/);
  assert.match(source, /stage\.addEventListener\("lyrion-track-details",event=>\{enrichedDetails=\{key:detailKey\(event\.detail\?\.track\),details:event\.detail\?\.details\|\|null\};/);
  assert.match(source, /rows=lyrionDetailRows\(track,duration,status,enrichedDetails\?\.key===detailKey\(track\)\?enrichedDetails\.details:null\);/);
});

test("the rail shows beside the artwork in the normal view, not only in Fullscreen, and looks up while the tab is visible", () => {
  assert.doesNotMatch(css, /#lyrionDiscoveryRail \{display:none;\}/);
  assert.match(css, /\n#lyrionDiscoveryRail \{display:block;border-left:1px solid var\(--lyrion-line\);/);
  assert.match(rail, /const visible=\(\)=>!stage\.closest\?\.\('\.lyrionTabPanel'\)\?\.hidden;/);
  assert.doesNotMatch(rail, /lyrionNow--fullscreen/);
  assert.match(rail, /const stageFavorites=document\.getElementById\('lyrionStageFavorites'\);if\(stageFavorites\)rail\.append\(stageFavorites\);/);
});

test("with Beatport turned off the rail hides its Beatport section instead of retrying a lookup that cannot succeed", () => {
  assert.match(rail, /\$\('lyrionBeatportSection'\)\.hidden=result\.beatportEnabled===false;/);
  assert.match(rail, /if\(!m\)\{if\(result\.beatportEnabled===false\)\{\$\('lyrionBeatportStatus'\)\.textContent='';return;\}retryMetadata/);
});

test("the rail loads the TIDAL playlists once when it first shows, not on every status poll", () => {
  assert.match(rail, /if\(visible\(\)&&!playlistsRequested\)\{playlistsRequested=true;void loadPlaylists\(\);\}/);
});

test("a radio stream reports its station name and description, but a local file has no station", async () => {
  const rpc = async () => ({ mode: "play", player_connected: 1, playlist_tracks: 1, playlist_cur_index: 0, time: 217.5,
    current_title: "Drone Zone: Atmospheric ambient space music.",
    playlist_loop: [{ id: "-9", title: "Dani", artist: "Rising Galaxy", remote: 1, remote_title: "SomaFM Drone Zone 256", url: "http://ice6.somafm.com/dronezone-256-mp3", "playlist index": 0 }] });
  const lms = new LyrionClient({ baseUrl: "http://lms.example:9000" }); lms.rpc = rpc; lms.hqplayerFor = async () => null;
  assert.deepEqual((await lms.status("p")).station, { name: "SomaFM Drone Zone 256", description: "Drone Zone: Atmospheric ambient space music." });
  lms.rpc = async () => ({ mode: "play", player_connected: 1, playlist_tracks: 1, playlist_cur_index: 0, current_title: "Sorrow", playlist_loop: [{ ...localTrack, remote: 0 }] });
  assert.equal((await lms.status("p")).station, null);
});

test("a description that only repeats the title or the station name is not shown twice", async () => {
  const lms = new LyrionClient({ baseUrl: "http://lms.example:9000" }); lms.hqplayerFor = async () => null;
  lms.rpc = async () => ({ mode: "play", player_connected: 1, playlist_tracks: 1, playlist_cur_index: 0, current_title: "Dani", playlist_loop: [{ id: "-9", title: "Dani", remote: 1, remote_title: "Station", url: "http://x", "playlist index": 0 }] });
  assert.deepEqual((await lms.status("p")).station, { name: "Station", description: "" });
});

test("a radio stream shows its station, the time listened so far, and what the station is about", () => {
  const stream = client.track({ id: "-9", title: "Dani", artist: "Rising Galaxy", type: "mp3", bitrate: "256kbps CBR", url: "http://ice6.somafm.com/x", "playlist index": 0 });
  assert.deepEqual(rows(stream, 0, { position: 217.5, station: { name: "SomaFM Drone Zone 256", description: "Atmospheric ambient." } }), [
    ["Station", "SomaFM Drone Zone 256"], ["Track length", "Live stream · 3:37"], ["About", "Atmospheric ambient."], ["Format", "MP3 · 256 kbps CBR"]]);
  assert.deepEqual(rows(stream, 0, { position: 0, station: null })[0], ["Track length", "Live stream"]);
});

test("SiriusXM keeps its own program block, so no separate station rows are added", () => {
  const stream = client.track({ id: "-9", title: "Song", artist: "Artist", url: "sxm:channel", "playlist index": 0 });
  assert.equal(rows(stream, 0, { position: 10, siriusxmMetadata: { channelName: "Octane" }, station: { name: "Octane", description: "Rock" } }).some(r => ["Station", "About"].includes(r[0])), false);
});

test("under the artwork Lyrion names the next track and how many remain, instead of a bare item count", () => {
  const context = {};
  vm.runInNewContext(section("  function upNext(s){", "  async function refreshStatus() {"), context);
  const queue = [{ index: 4, title: "Now" }, { index: 5, title: "Next one", artist: "Artist" }];
  assert.equal(context.upNext({ queue, queueIndex: 4, queueCount: 12 }), "Up next: Next one - Artist · 7 remaining");
  assert.equal(context.upNext({ queue: [{ index: 4, title: "Now" }], queueIndex: 4, queueCount: 12 }), "7 remaining");
  assert.equal(context.upNext({ queue: [{ index: 0, title: "Only" }], queueIndex: 0, queueCount: 1 }), "Nothing queued after this");
  assert.doesNotMatch(source, /items queued/);
});
