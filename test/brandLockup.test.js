"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createThemes } = require("../src/uiThemes");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const read = file => fs.readFileSync(path.join(publicDir, file), "utf8");
const html = read("index.html"), css = read("styles.css"), lyrion = read("lyrion.js"), lyrionCss = read("lyrion.css");

test("the app header carries the Rabbit Hole lockup: the disc, the name and the tagline", () => {
  assert.match(html, /<div class="appIdentity">\n          <span class="appIdentityMark" aria-hidden="true"><\/span>\n          <span class="appIdentityText"><span class="appIdentityName">The Rabbit Hole<\/span><span class="appIdentityTagline">Discover Beyond the Playlist<\/span><\/span>\n          <p id="systemTag" class="systemTag">/);
});

test("the disc is cut from the Rabbit Hole artwork, so it is drawn from the active theme's copy", () => {
  assert.match(css, /\.appIdentityMark \{\n  flex: 0 0 auto;\n  width: 56px;\n  height: 56px;\n  border-radius: 50%;\n  background: url\("\/assets\/rabbit-hole-fallback\.jpg"\) 50% 9\.55% \/ 152\.4% no-repeat;/);
  const themes = createThemes({ themesDir: path.join(root, "src", "themes"), defaultTheme: "copper" });
  for (const { id } of themes.list().themes) {
    const served = themes.assetPath(publicDir, "/assets/rabbit-hole-fallback.jpg", `rh_theme=${id}`);
    const expected = id === "original" ? null : path.join(publicDir, "themes", id, "assets", "rabbit-hole-fallback.jpg");
    assert.equal(served, expected, id);
  }
  assert.ok(fs.statSync(path.join(publicDir, "assets", "rabbit-hole-fallback.jpg")).isFile(), "the Original theme's copy");
});

test("the name and tagline are drawn in the logo's colour for every theme", () => {
  const themes = createThemes({ themesDir: path.join(root, "src", "themes"), defaultTheme: "copper" });
  const brand = id => /\.appIdentityName \{\n  flex: 0 0 auto;\n  color: (#[0-9a-f]{6});/.exec(themes.render(publicDir, path.join(publicDir, "styles.css"), Buffer.from(css), `rh_theme=${id}`).toString())[1];
  assert.deepEqual(Object.fromEntries(themes.list().themes.map(({ id }) => [id, brand(id)])), {
    copper: "#dab981", "dark-orange": "#ff430f", "graphite-brass": "#d3ae69", original: "#9b5cff", "roon-light": "#1c469c", roon: "#749ae7"
  });
});

test("the tagline matches the name's colour, and phones get a smaller lockup", () => {
  assert.match(css, /\.appIdentityTagline \{\n  color: #9b5cff;\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: 0\.22em;\n  text-transform: uppercase;\n  opacity: 0\.78;\n\}/);
  assert.match(css, /@media \(max-width: 699px\) \{\n  \.appIdentityMark \{\n    width: 40px;\n    height: 40px;\n  \}\n\n  \.appIdentityTagline \{\n    font-size: 9px;\n    letter-spacing: 0\.14em;\n  \}\n\}/);
});

test("the top right of the Playback System row stays empty, with no second logo and no hint", () => {
  assert.doesNotMatch(lyrion + lyrionCss, /playbackSystemLogo|playbackSystemHint|Independent [Pp]layers and [Qq]ueues/);
  assert.equal(fs.existsSync(path.join(publicDir, "assets", "rabbit-hole-logo.webp")), false);
});
