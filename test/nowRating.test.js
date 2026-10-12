"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const read = file => fs.readFileSync(require.resolve(`../public/${file}`), "utf8");
const html = read("index.html"), css = read("styles.css"), app = read("app.js"), lyrionCss = read("lyrion.css");
const fn = name => { const start = app.indexOf(`function ${name}(`); assert.ok(start >= 0, name); return app.slice(start, app.indexOf("\n}\n", start) + 3); };

function ratingContext() {
  const context = {};
  vm.runInNewContext(["escapeHtml", "normalizeFeedbackValue", "scoreBandFor", "feedbackBadgeLabel", "ratingStarsHtml", "nowRatingHtml"].map(fn).join("\n") + "\nfunction feedbackForTrack() { return ''; }", context);
  return context;
}

test("a rated Roon track shows its rating as stars out of five with the rating's name", () => {
  const { nowRatingHtml } = ratingContext();
  const stars = rating => nowRatingHtml({ feedback: rating });
  assert.equal(stars("love"), '<span class="nowRatingStars" role="img" aria-label="5 of 5 stars">★★★★★</span> Loved');
  assert.equal(stars("like"), '<span class="nowRatingStars" role="img" aria-label="4 of 5 stars">★★★★<span class="nowRatingEmpty">★</span></span> Liked');
  assert.equal(stars("ok"), '<span class="nowRatingStars" role="img" aria-label="3 of 5 stars">★★★<span class="nowRatingEmpty">★★</span></span> Okay');
  assert.equal(stars("skip"), '<span class="nowRatingStars" role="img" aria-label="2 of 5 stars">★★<span class="nowRatingEmpty">★★★</span></span> Disliked');
  assert.equal(stars("never"), '<span class="nowRatingStars" role="img" aria-label="1 of 5 stars">★<span class="nowRatingEmpty">★★★★</span></span> Never Again');
  assert.equal(stars("wrong_genre"), "Marked Wrong Genre", "a judgement that is not a score stays in words");
});

test("the rating line adds a Discovery score, and an unrated, unscored track has no line at all", () => {
  const { nowRatingHtml } = ratingContext();
  assert.equal(nowRatingHtml({ feedback: "love", score: 84 }), '<span class="nowRatingStars" role="img" aria-label="5 of 5 stars">★★★★★</span> Loved · Discovery 84 - Strong');
  assert.equal(nowRatingHtml({ score: 64, belowMinimum: true }), "Discovery 64 - Experimental - below minimum");
  assert.equal(nowRatingHtml({}), "");
  assert.doesNotMatch(app, /Unscored now playing|Loved now playing/);
});

test("the rating sits under the album art in the playback strip, not as a pill above it", () => {
  assert.match(html, /<div id="nowPlayback" class="playbackStrip" hidden><p id="nowPlaybackChain"><\/p><p id="nowPlaybackSignal" class="playbackStripSignal" hidden><\/p><p id="nowRating" class="nowRating" hidden><\/p><\/div>/);
  assert.doesNotMatch(html + css + app, /nowDiscoveryBadge/);
  assert.match(app, /rating\.innerHTML = nowRatingHtml\(match\.track\);\n  rating\.hidden = !rating\.innerHTML;/);
  assert.match(css, /\.nowRatingStars \{\n  color: var\(--accent\);\n  letter-spacing: 0\.08em;\n\}\n\n\.nowRatingEmpty \{\n  opacity: 0\.28;\n\}/);
});

test("no player layout keeps an empty grid row or column for the old badge", () => {
  for (const [, areas] of css.matchAll(/grid-template-areas:([^;]*);/g)) assert.doesNotMatch(areas, /\bbadge\b/);
  assert.match(css, /grid-template-rows: auto auto minmax\(280px, 72vw\) auto auto auto;\n    grid-template-areas:\n      "viewControls"\n      "now"\n      "art"/);
});

test("the cover leaves room for a third strip line when the rating is showing", () => {
  assert.match(css, /> \.artStack > \.cover:has\(\+ #nowPlayback:not\(\[hidden\]\) > #nowRating:not\(\[hidden\]\)\) \{\n    width: min\(100cqw, calc\(100cqh - 74px\)\);/);
});

test("Lyrion's artwork starts at the top of its lane like Roon's, and stays centred in Fullscreen", () => {
  assert.match(lyrionCss, /\.lyrionArtworkLane \{min-width:0;min-height:0;align-self:start;/);
  assert.match(lyrionCss, /\.lyrionNow--fullscreen \.lyrionArtworkLane \{align-self:center;\}/);
});

test("Lyrion shows the same stars under its album art, and updates them with the rating buttons", () => {
  const lyrion = read("lyrion.js"), rail = read("lyrionDiscoveryRail.js");
  assert.match(lyrion, /<div id="lyrionPlayback" class="playbackStrip"><p id="lyrionChain">Lyrion<\/p><p id="lyrionHqplayer" class="playbackStripSignal" hidden><\/p><p id="lyrionRating" class="nowRating" hidden><\/p><\/div>/);
  assert.match(rail, /function renderFeedback\(rating\)\{\n  const canRate=typeof feedbackButtonsHtml==='function'&&!!track\?\.title&&!!track\?\.artist;\n  const line=\$\('lyrionRating'\);line\.innerHTML=canRate\?ratingStarsHtml\(normalizeFeedbackValue\(rating\)\):'';line\.hidden=!line\.innerHTML;/);
  const { ratingStarsHtml } = ratingContext();
  assert.equal(ratingStarsHtml("never"), '<span class="nowRatingStars" role="img" aria-label="1 of 5 stars">★<span class="nowRatingEmpty">★★★★</span></span> Never Again');
  assert.equal(ratingStarsHtml(""), "");
});
