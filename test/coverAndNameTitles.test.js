"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildDiscoveryProfile, rejectReason } = require("../src/discoveryEngine");

function gabrielOptions() {
  return {
    request: "find tracks like Peter Gabriel - Solsbury Hill, but deeper and less obvious",
    scoringMode: "taste-guided",
    llmSearchPlan: {
      intentRoute: "similarity",
      seedArtists: ["Peter Gabriel"],
      candidateArtists: ["Kate Bush", "Talking Heads"],
      targetGenres: ["progressive rock", "art rock"],
      searchQueries: ["Peter Gabriel art rock"]
    }
  };
}

function check(track) {
  const options = gabrielOptions();
  return rejectReason({ durationMs: 240000, year: 2020, query: "Peter Gabriel art rock", ...track }, options, buildDiscoveryProfile(options));
}

const COVER = "Cover/karaoke/tribute catalogue result.";

test("a 'made popular by' karaoke backing track is rejected as a cover", () => {
  assert.equal(check({
    artist: "Party Tyme",
    title: "In Your Eyes (made popular by Peter Gabriel) [backing version]",
    album: "Sing the Hits of Peter Gabriel",
    label: "Sybersound Records"
  }), COVER);
});

test("a 'made popular by' vocal version is rejected as a cover", () => {
  assert.equal(check({
    artist: "Party Tyme",
    title: "I Have The Touch (made popular by Peter Gabriel) [vocal version]",
    album: "Hits of the 80s, Vol. 4",
    label: "Sybersound Records"
  }), COVER);
});

test("a backing track without an artist credit is rejected as a cover", () => {
  assert.equal(check({ artist: "Studio Band", title: "Solsbury Hill (Backing Track)", album: "Hits", label: "X", query: "art rock 1980s" }), COVER);
});

test("a song by someone else titled only with the searched artist's name is not that artist", () => {
  assert.match(check({ artist: "PoP Campaign", title: "Peter Gabriel", album: "Peter Gabriel", label: "PoP Campaign" }),
    /Search was for Peter Gabriel, but TIDAL returned PoP Campaign\./);
});

test("a remix credit naming the searched artist still counts as that artist", () => {
  assert.doesNotMatch(check({ artist: "Someone", title: "Biko (Peter Gabriel Remix)", album: "Biko", label: "Real World" }),
    /Search was for/);
});

test("the searched artist's own tracks are kept", () => {
  assert.doesNotMatch(check({ artist: "Peter Gabriel", title: "Peter Gabriel", album: "Peter Gabriel 3: Melt", label: "Real World" }),
    /Search was for|Cover\/karaoke/);
  assert.doesNotMatch(check({ artist: "Peter Gabriel", title: "Won't Stand Down (Dark-Side Mix)", album: "o\\i", label: "Peter Gabriel Ltd" }),
    /Search was for|Cover\/karaoke/);
});
