"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const { tasteNarrative, tasteNarrativeParts } = require("../src/listeningHistory");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");

const input = {
  topArtists: [], topLabels: [], likedArtists: [{ name: "Alice In Chains" }, { name: "Led Zeppelin" }],
  likedLabels: [{ name: "Slash Records" }, { name: "Warner Music UK Ltd" }], plays: 536, discoveryCount: 907,
  nowPlaying: { artist: "Malia", title: "Celestial Echo" },
  tasteDna: { confidence: { feedbackCount: 17, detailedMemoryCount: 2, radioFeedbackCount: 1, depthLabel: "Early" }, genres: [{ name: "Breakbeat" }], formats: [{ name: "club-length 4-6 min" }], sources: [{ name: "Now Playing" }], traits: [], avoid: [] }
};

test("the taste summary is the short part, and each signal is its own detail line", () => {
  const parts = tasteNarrativeParts(input);
  assert.equal(parts.summary, "Taste depth is early from 17 ratings, 2 scored memories, and 1 radio feedback signals. The strongest lane evidence points to breakbeat.");
  assert.deepEqual(parts.details, [
    "Artist gravity around Alice In Chains, Led Zeppelin",
    "Label pull from Slash Records, Warner Music UK Ltd",
    "Format bias toward club-length 4-6 min",
    "Discovery sources that have worked: Now Playing",
    "907 recent discovery candidates",
    "Currently on Malia - Celestial Echo"
  ]);
});

test("the full narrative is unchanged, so anything reading it still gets the same text", () => {
  assert.equal(tasteNarrative(input), "Taste depth is early from 17 ratings, 2 scored memories, and 1 radio feedback signals. The strongest lane evidence points to breakbeat. Strongest signals: artist gravity around Alice In Chains, Led Zeppelin; label pull from Slash Records, Warner Music UK Ltd; format bias toward club-length 4-6 min; discovery sources that have worked: Now Playing; 907 recent discovery candidates; currently on Malia - Celestial Echo.");
});

test("Taste explains itself, shows the summary and folds the signals under Details, in Title Case", () => {
  assert.match(html, /<h2 id="tasteProfileHeading">Current Music Taste<\/h2>\s*<p class="pageIntro">What Rabbit Hole has learned about your taste from what you play in Roon and how you rate tracks\. Discovery uses it to choose and rank suggestions; Use Taste as Prompt starts a Rabbit Hole search from it\.<\/p>/);
  assert.match(html, /<details id="tasteDetails" class="pageDetails" hidden><summary>Details<\/summary><ul id="tasteDetailList"><\/ul><\/details>/);
  assert.match(html, /<button type="button" id="refreshHistory">Refresh Taste Profile<\/button>\s*<button type="button" id="tastePrompt">Use Taste as Prompt<\/button>/);
  assert.match(app, /\$\("#tasteNarrative"\)\.textContent = report\.tasteSummary \|\| report\.tasteNarrative \|\| "No taste report yet\.";/);
  assert.match(app, /list\.replaceChildren\(\.\.\.details\.map\(\(line\) => Object\.assign\(document\.createElement\("li"\), \{ textContent: line \}\)\)\);/);
  assert.match(html, /<details id="standbyDetails" class="pageDetails" hidden>/);
  assert.match(css, /\.pageDetails \{/);
  assert.doesNotMatch(css, /\.standbyDetails/);
});
