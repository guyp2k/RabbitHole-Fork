"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../public/lyrion.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/lyrion.css"), "utf8");
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));

test("the Sources panel is titled Sources & Discovery and the setup pages sit in its Setup menu, not under the heading", () => {
  assert.match(source, /<div class="lyrionSourcesHead"><div class="queueViewHeader"><div><p class="eyebrow">Lyrion<\/p><h2>Sources & Discovery<\/h2><p class="muted">Browse and search everything this Lyrion server can play\.<\/p><\/div><\/div><details class="lyrionSetup" id="lyrionSetup"><summary>Setup<\/summary><ul>/);
  const menu = source.slice(source.indexOf('<details class="lyrionSetup"'), source.indexOf("</details>"));
  assert.deepEqual([...menu.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(m => [m[1], m[2]]),
    [["/soundcloud-setup.html", "Connect SoundCloud playlists"], ["/siriusxm-setup.html", "SiriusXM metadata"]]);
  assert.doesNotMatch(source, /<h2>Sources & discovery<\/h2><p>/);
  assert.doesNotMatch(source, /Sources & discovery/);
});

test("the Setup menu sits on the left under the heading and opens below its button, on top of the source list", () => {
  assert.match(css, /\.lyrionSourcesHead\s*\{[^}]*display:grid;justify-items:start/);
  assert.doesNotMatch(css, /\.lyrionSourcesHead\s*\{[^}]*justify-content:space-between/);
  assert.match(css, /\.lyrionSetup\s*\{[^}]*position:relative/);
  assert.match(css, /\.lyrionSetup ul\s*\{[^}]*position:absolute[^}]*left:0[^}]*z-index:\d+/);
});

function menuHarness() {
  const listeners = {};
  const menu = { open: false, contains: node => node === "inside", querySelector: () => summary };
  const summary = { focused: false, focus() { this.focused = true; } };
  const context = { $: id => (id === "lyrionSetup" ? menu : null), document: { addEventListener: (type, fn) => { listeners[type] = fn; } } };
  vm.runInNewContext(section("  const setupMenu=", "  const renderSystemChoices="), context);
  return { menu, summary, listeners };
}

test("the Setup menu closes on a click outside it or on Escape, and stays open for clicks inside", () => {
  const h = menuHarness();
  h.menu.open = true; h.listeners.click({ target: "inside" }); assert.equal(h.menu.open, true);
  h.listeners.click({ target: "elsewhere" }); assert.equal(h.menu.open, false);
  h.menu.open = true; h.listeners.keydown({ key: "Enter" }); assert.equal(h.menu.open, true);
  h.listeners.keydown({ key: "Escape" }); assert.equal(h.menu.open, false); assert.equal(h.summary.focused, true);
  h.summary.focused = false; h.listeners.keydown({ key: "Escape" }); assert.equal(h.summary.focused, false);
});

test("the Rabbit Hole logo replaces the playback system hint at the top right, on Roon and Lyrion alike", () => {
  assert.match(source, /<span id="playbackSystemLinks" class="lyrionChoices" hidden><\/span><img id="playbackSystemLogo" class="playbackSystemLogo" src="\/assets\/rabbit-hole-logo\.webp" alt="The Rabbit Hole: Discover Beyond the Playlist" width="346" height="336">`;/);
  assert.doesNotMatch(source, /playbackSystemHint|Independent [Pp]layers and [Qq]ueues/);
  const logo = fs.readFileSync(require.resolve("../public/assets/rabbit-hole-logo.webp"));
  assert.equal(logo.toString("ascii", 0, 4) + logo.toString("ascii", 8, 12), "RIFFWEBP");
});

test("the logo fills the Playback System and HQPlayer rows when both show, without making either row taller", () => {
  const css = fs.readFileSync(require.resolve("../public/lyrion.css"), "utf8");
  assert.match(css, /\n\.playbackSystemBar:has\(\+ \.hqplayerLinksBar:not\(\[hidden\]\)\) \.playbackSystemLogo \{height:84px;margin-bottom:-46px;align-self:flex-start;\}/);
  assert.match(css, /@media\(max-width:600px\)\{\.playbackSystemBar \.playbackSystemLogo,\.playbackSystemBar:has\(\+ \.hqplayerLinksBar:not\(\[hidden\]\)\) \.playbackSystemLogo\{height:64px;margin-bottom:0;align-self:center;\}\}/);
});

test("the Playback System and Lyrion Player labels are title-cased, visibly and as their button groups' names", () => {
  assert.match(source, /<label for="playbackSystem">Playback System<\/label>/);
  assert.match(source, /<label for="lyrionPlayer" class="roonZoneLabel">Lyrion Player<\/label>/);
  assert.match(source, /choices\('playbackSystem','Playback System'\)/);
  assert.match(source, /choices\('lyrionPlayer','Lyrion Player'\)/);
  assert.doesNotMatch(source, /Playback system|>Lyrion player<|'Lyrion player'/);
});

test("the Refresh Players button is title-cased like the other controls", () => {
  assert.match(source, /<button id="lyrionRefresh" type="button">Refresh Players<\/button>/);
  assert.doesNotMatch(source, />Refresh players</);
});

test("the Setup toggle starts on the panel's content edge, like the heading and the rows below it", () => {
  const rule = css.match(/\.lyrionSetup summary\s*\{([^}]*)\}/)[1];
  assert.match(rule, /padding:0;/);
  assert.doesNotMatch(rule, /border:|background:|border-radius:/);
});
