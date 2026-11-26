"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");

test("every Discover page says what it does under its title", () => {
  assert.match(html, /<h2 id="composerTitle" class="resultsTitleToggle">Start the Rabbit Hole Journey<\/h2>\s*<p class="pageIntro">Describe what you want to hear, or start from the track playing, an artist or a playlist\. Rabbit Hole searches TIDAL, checks every track against Roon, drops the ones that fail and lists the rest to play, queue or send to TIDAL\.<\/p>/);
  assert.match(html, /<h2 id="standbyTitle">0\/25 standby tracks<\/h2>\s*<p class="pageIntro">Discovery tracks Rabbit Hole keeps ready in the background, already checked against TIDAL and Roon, so Queue gives you something new straight away\. The pool refreshes itself; Refresh starts a new search now\.<\/p>/);
  assert.match(html, /<h2>Progressive House Charts<\/h2>\s*<p class="pageIntro">Beatport's Progressive House charts\. Pick a chart and queue it: Rabbit Hole finds each track on TIDAL and checks it against Roon before it plays\.<\/p>/);
  assert.match(html, /<h2>Mixes & Radio<\/h2>\s*<p class="pageIntro">Your personal TIDAL mixes, such as My Mix and My Daily Discovery\. Play or queue one in Roon, turn it into a Rabbit Hole prompt or download its track list\. Paste a TIDAL link below to pin any playlist or mix here\.<\/p>/);
});

test("Standby's status line is a short summary, with the search diagnostics folded under Details", () => {
  const start = app.indexOf("function standbyStatusParts(");
  assert.ok(start >= 0);
  const context = { standbyTimeLabel: (iso) => `T(${iso})` };
  vm.runInNewContext(app.slice(start, app.indexOf("\n}\n", start) + 2) + "\nthis.parts = standbyStatusParts;", context);
  const parts = JSON.parse(JSON.stringify(context.parts({
    targetCount: 25, lastRefreshAt: "a", nextRefreshAt: "b",
    lastRun: { kept: 25, generated: 1376, diagnostics: { novelty: { finalCount: 25, newTracksIntroduced: 25, carriedOver: [] }, synapseReview: { participated: false, model: "m", failureType: "disabled", skipReason: "off" } } }
  }, 25)));
  assert.deepEqual(parts.summary, ["Updated T(a)", "25 ready", "Next T(b)"]);
  assert.deepEqual(parts.details, ["25/25 ready after 1376 checked", "25 / 25 fresh tracks found; new: 25; carried over: 0", "Synapse skipped (m) [disabled]: off; kept local/Qwen pool"]);
  const failed = JSON.parse(JSON.stringify(context.parts({ lastError: "TIDAL timed out", refreshing: true }, 0)));
  assert.deepEqual(failed.summary, ["Refreshing", "Last refresh failed: TIDAL timed out", "0 ready"]);
  assert.match(html, /<details id="standbyDetails" class="standbyDetails" hidden><summary>Details<\/summary><p id="standbyDetailText"><\/p><\/details>/);
  assert.match(html, /<button type="button" id="standbyQueueNext" disabled>Queue Next<\/button>/);
  assert.match(html, /<button type="button" id="beatportChartQueue" disabled>Add to Queue<\/button>\s*<button type="button" id="beatportChartQueueNext" disabled>Queue Next<\/button>/);
  assert.match(app, /buttonText: "Add to Queue",[\s\S]*?buttonText: "Queue Next",/);
});
