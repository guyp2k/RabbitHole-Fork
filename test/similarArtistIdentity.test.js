"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildDiscoveryProfile, rejectReason } = require("../src/discoveryEngine");

function options(evidence = []) {
  return {
    request: "find tracks like Peter Gabriel - Solsbury Hill, but deeper and less obvious",
    scoringMode: "taste-guided",
    llmSearchPlan: {
      intentRoute: "similarity",
      seedArtists: ["Peter Gabriel"],
      candidateArtists: ["Kate Bush", "Nick Drake"],
      targetGenres: ["progressive rock", "art rock"]
    },
    similarArtistSeeds: evidence.map((item) => item.name),
    similarArtistEvidence: evidence
  };
}

const LASTFM_GABRIEL = [
  { name: "Genesis", seedArtist: "Peter Gabriel", matchScore: 1, source: "Last.fm similar" },
  { name: "Steve Hackett", seedArtist: "Peter Gabriel", matchScore: 0.8, source: "Last.fm similar" },
  { name: "This Mortal Coil", seedArtist: "Kate Bush", matchScore: 0.7, source: "Last.fm similar" }
];

function check(track, opts) {
  return rejectReason({ durationMs: 400000, year: 1973, label: "Charisma", query: "Peter Gabriel art rock", ...track }, opts, buildDiscoveryProfile(opts));
}

const DRIFT = /Search was for Peter Gabriel, but TIDAL returned/;

test("an artist Last.fm returned as similar to the searched artist is kept on that artist's search", () => {
  const opts = options(LASTFM_GABRIEL);
  assert.doesNotMatch(check({ artist: "Genesis", title: "Supper's Ready (2007 Stereo Mix)", album: "Foxtrot" }, opts), DRIFT);
  assert.doesNotMatch(check({ artist: "Steve Hackett", title: "Every Day", album: "Spectral Mornings" }, opts), DRIFT);
});

test("without Last.fm evidence a related act is still another artist", () => {
  assert.match(check({ artist: "Genesis", title: "Supper's Ready (2007 Stereo Mix)", album: "Foxtrot" }, options([])), DRIFT);
});

test("an artist similar to a different seed does not pass on this artist's search", () => {
  assert.match(check({ artist: "This Mortal Coil", title: "Song to the Siren", album: "It'll End in Tears" }, options(LASTFM_GABRIEL)), DRIFT);
});

test("name lookalikes stay rejected when Last.fm evidence is present", () => {
  const opts = options(LASTFM_GABRIEL);
  assert.match(check({ artist: "Peter Balazs", title: "New Alternative Rock", album: "X" }, opts), DRIFT);
  assert.match(check({ artist: "Genesis Owusu", title: "The Other Black Dog", album: "Smiling with No Teeth" }, opts), DRIFT);
});
