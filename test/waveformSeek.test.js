"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { createWaveformPeaks, peaksFromSamples, BUCKETS } = require("../src/waveformPeaks");
const { libraryTrackId } = require("../src/roonSourceFormat");

function fakeFfmpeg(samples, { code = 0, fail = null } = {}) {
  const calls = [];
  const spawnImpl = (cmd, args) => {
    calls.push([cmd, args]);
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
    setImmediate(() => {
      if (fail) return child.emit("error", Object.assign(new Error(fail), { code: fail }));
      const bytes = Buffer.alloc(samples.length * 2); samples.forEach((v, i) => bytes.writeInt16LE(v, i * 2));
      child.stdout.emit("data", bytes); child.emit("close", code);
    });
    return child;
  };
  return { spawnImpl, calls };
}

test("peaks are the loudness of each slice, scaled so the loudest slice is 1", () => {
  const quiet = new Float32Array(100).fill(0.1), loud = new Float32Array(100).fill(0.5);
  const peaks = peaksFromSamples(Float32Array.from([...quiet, ...loud]), 2);
  assert.deepEqual(peaks, [0.2, 1]);
  assert.equal(peaksFromSamples(new Float32Array(50), 2), null, "silence has no waveform rather than a flat one pretending to be audio");
});

test("a library file is decoded from LMS once, at a low mono rate, and kept for later", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waveform-"));
  const { spawnImpl, calls } = fakeFfmpeg(Array.from({ length: 4800 }, (_, i) => (i % 2 ? 1 : -1) * (i < 2400 ? 3000 : 12000)));
  const peaks = createWaveformPeaks({ lmsBaseUrl: "http://lms.test:9000/anything", cacheDir: dir, spawnImpl });
  const first = await peaks.forLmsTrack("198943");
  assert.equal(first.peaks.length, BUCKETS);
  assert.equal(first.peaks[0], 0.25); assert.equal(first.peaks[BUCKETS - 1], 1);
  assert.deepEqual(calls[0][1].slice(calls[0][1].indexOf("-i"), calls[0][1].indexOf("-i") + 2), ["-i", "http://lms.test:9000/music/198943/download"]);
  assert.deepEqual(calls[0][1].slice(-8), ["-vn", "-ac", "1", "-ar", "2000", "-f", "s16le", "pipe:1"]);
  await peaks.forLmsTrack("198943");
  assert.equal(calls.length, 1, "the second request is served from memory");
  const reopened = createWaveformPeaks({ lmsBaseUrl: "http://lms.test:9000", cacheDir: dir, spawnImpl });
  assert.deepEqual((await reopened.forLmsTrack("198943")).peaks, first.peaks);
  assert.equal(calls.length, 1, "a restart reads the stored waveform instead of decoding again");
});

test("only a numeric LMS track id is decoded, so a stream or a crafted id never reaches ffmpeg", async () => {
  const { spawnImpl, calls } = fakeFfmpeg([1, 2, 3]);
  const peaks = createWaveformPeaks({ lmsBaseUrl: "http://lms.test:9000", spawnImpl });
  for (const bad of ["-94125648026728", "1;rm", "../1", "", undefined]) assert.equal((await peaks.forLmsTrack(bad)).peaks, null);
  assert.equal(calls.length, 0);
});

test("without ffmpeg the waveform is unavailable, and it stops trying until restart", async () => {
  const { spawnImpl, calls } = fakeFfmpeg([], { fail: "ENOENT" });
  const peaks = createWaveformPeaks({ lmsBaseUrl: "http://lms.test:9000", spawnImpl });
  assert.deepEqual(await peaks.forLmsTrack("1"), { peaks: null, reason: "No audio decoder is installed." });
  assert.deepEqual(await peaks.forLmsTrack("2"), { peaks: null, reason: "No audio decoder is installed." });
  assert.equal(calls.length, 1);
});

test("a file ffmpeg cannot decode has no waveform and is not cached as one", async () => {
  const { spawnImpl, calls } = fakeFfmpeg([1000, -1000], { code: 1 });
  const peaks = createWaveformPeaks({ lmsBaseUrl: "http://lms.test:9000", spawnImpl });
  assert.deepEqual(await peaks.forLmsTrack("7"), { peaks: null, reason: "The file could not be decoded." });
  await peaks.forLmsTrack("7");
  assert.equal(calls.length, 2);
});

test("a Roon track gets the waveform of its Lyrion library file, matched like the Format row", () => {
  const track = { title: "Sorrow", artist: "David Gilmour", album: "Live at the Circus Maximus", lengthSeconds: 655 };
  const row = { id: "150001", title: "Sorrow", artist: "David Gilmour", album: "Live at the Circus Maximus", duration: 655.4, samplerate: 96000 };
  assert.equal(libraryTrackId(track, [row, { ...row, id: "150002", album: "Other" }]), "150001");
  assert.equal(libraryTrackId(track, [{ ...row, duration: 600 }]), "");
  const server = fs.readFileSync(require.resolve("../src/server.js"), "utf8");
  assert.match(server, /pathname === "\/api\/roon\/waveform"[\s\S]*?libraryTrackId\(track, rows\)[\s\S]*?waveformPeaks\.forLmsTrack\(trackId\)/);
  assert.match(server, /url\.pathname==='\/api\/lyrion\/waveform'&&req\.method==='GET'\)\{\n      return sendJson\(res,200,await waveformPeaks\.forLmsTrack\(url\.searchParams\.get\('trackId'\)\)\);/);
});

const client = fs.readFileSync(require.resolve("../public/waveformSeek.js"), "utf8");
const section = (from, to) => client.slice(client.indexOf(from), client.indexOf(to));

test("the drawn bars take the loudest peak in each column, so short transients still show", () => {
  const context = {};
  vm.runInNewContext(section("  function bars(peaks, count) {", "  function attach(input) {"), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.bars([0.1, 0.9, 0.2, 0.3], 2))), [0.9, 0.3]);
  assert.equal(context.bars(null, 10), null);
});

test("both players keep their seek slider for seeking and keyboard use, drawn over by the waveform", () => {
  assert.match(client, /input\.before\(wrap\); wrap\.append\(canvas, input\);/);
  assert.match(client, /document\.getElementById\("seekSlider"\)/);
  assert.match(client, /document\.getElementById\("lyrionProgress"\)/);
  const css = fs.readFileSync(require.resolve("../public/waveformSeek.css"), "utf8");
  assert.match(css, /\.waveformSeek > input\[type="range"\] \{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer;\}/);
  assert.match(css, /\.waveformSeek:has\(> input:focus-visible\) \{outline:2px solid var\(--accent\);/);
});

test("without real peaks the bar is a flat dotted line, never an invented waveform", () => {
  assert.match(client, /const h = levels \? Math\.max\(2, level \* height\) : 2;/);
  assert.doesNotMatch(client, /Math\.random/);
});

test("Lyrion asks for a waveform only for a library file, and Roon for the zone that is playing", () => {
  assert.match(client, /if \(track\?\.source === "Local" && \/\^\\d\+\$\/\.test\(String\(track\.id \|\| ""\)\)\) void load\(`\/api\/lyrion\/waveform\?trackId=/);
  assert.match(client, /void load\(`\/api\/roon\/waveform\?zone_id=\$\{encodeURIComponent\(zone\.zone_id\)\}`/);
  assert.match(client, /if \(current\(\) === key\) target\.setPeaks\(data\?\.peaks \|\| null\);/);
});
