"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");

test("Sonic Review lives under System, after Database, in the navigation and the view map", () => {
  assert.match(html, /data-nav-item="database" data-view="database">Database<\/button>\s*<button type="button" data-nav-group="system" data-nav-item="sonic-review" data-view="sonicReview" data-requires="sonic" hidden>Sonic Review<\/button>/);
  assert.doesNotMatch(html, /data-nav-group="discover" data-nav-item="sonic-review"/);
  assert.match(app, /sonicReview: \{ group: "system", item: "sonic-review" \},/);
});

test("Sonic Review explains itself in plain words, including what it needs", () => {
  assert.match(app, /<p class="eyebrow">System<\/p>\s*<h2 id="sonicReviewHeading">Sonic Review<\/h2>\s*<p class="sonicReviewIntro">A listening test for Rabbit Hole's sound-similarity model\. Pick a track \(the one playing in Roon works\), listen to the tracks the model says sound alike, and mark whether they do\. Your answers are kept to judge the model; they do not change your ratings or recommendations\. Anything you queue from here still goes through strict TIDAL and Roon verification\. It needs Sonic audio profiles; without them there is nothing to compare\.<\/p>/);
});
