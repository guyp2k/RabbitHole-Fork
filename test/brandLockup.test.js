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

test("the disc is a pre-rendered mark at three times its drawn size, served in the active theme's colours", () => {
  assert.match(css, /\.appIdentityMark \{\n  flex: 0 0 auto;\n  width: 56px;\n  height: 56px;\n  border-radius: 50%;\n  background: url\("\/assets\/rabbit-hole-mark\.png"\) center \/ cover no-repeat;/);
  const themes = createThemes({ themesDir: path.join(root, "src", "themes"), defaultTheme: "copper" });
  for (const { id } of themes.list().themes) {
    const served = themes.assetPath(publicDir, "/assets/rabbit-hole-mark.png", `rh_theme=${id}`);
    const expected = id === "original" ? null : path.join(publicDir, "themes", id, "assets", "rabbit-hole-mark.png");
    assert.equal(served, expected, id);
    const png = fs.readFileSync(served || path.join(publicDir, "assets", "rabbit-hole-mark.png"));
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20), png[25]], [168, 168, 6], `${id} is a 168px PNG with an alpha channel`);
  }
  assert.match(fs.readFileSync(path.join(root, "scripts", "render-theme-art.js"), "utf8"), /remapPixels\(Buffer\.from\(original\.raw\), 3, rules\)/, "each theme recolours the original pixels, not the previous theme's");
});

test("the name and tagline are drawn in the logo's colour for every theme", () => {
  const themes = createThemes({ themesDir: path.join(root, "src", "themes"), defaultTheme: "copper" });
  const brand = id => /\.appIdentityName \{\n  flex: 0 0 auto;\n  color: (#[0-9a-f]{6});/.exec(themes.render(publicDir, path.join(publicDir, "styles.css"), Buffer.from(css), `rh_theme=${id}`).toString())[1];
  assert.deepEqual(Object.fromEntries(themes.list().themes.map(({ id }) => [id, brand(id)])), {
    copper: "#dab981", "dark-orange": "#ff430f", "graphite-brass": "#d3ae69", miyara: "#ff4757", original: "#9b5cff", "roon-light": "#1c469c", roon: "#749ae7"
  });
});

test("the tagline matches the name's colour, and phones get a smaller lockup", () => {
  assert.match(css, /\.appIdentityTagline \{\n  color: #9b5cff;\n  font-size: 10px;\n  font-weight: 700;\n  letter-spacing: 0\.22em;\n  text-transform: uppercase;\n  opacity: 0\.78;\n\}/);
  assert.match(css, /@media \(max-width: 699px\) \{\n  \.appIdentityMark \{\n    width: 40px;\n    height: 40px;\n  \}\n\n  \.appIdentityTagline \{\n    font-size: 9px;\n    letter-spacing: 0\.14em;\n  \}\n\}/);
});

test("the provider line beside the lockup is drawn at 12px by the rule scoped to the lockup", () => {
  assert.match(css, /\n\.appIdentity \.systemTag \{\n  max-width: min\(48vw, 560px\);\n  padding: 0;\n  border: 0;\n  background: transparent;\n  box-shadow: none;\n  color: rgba\(238, 228, 252, 0\.58\);\n  font-size: 12px;\n\}/);
  assert.equal([...css.matchAll(/\.appIdentity \.systemTag \{[^}]*font-size/g)].length, 1, "no other lockup rule resizes it");
  assert.match(css, /\.appIdentity \.systemTag \{\n    max-width: min\(54vw, 640px\);/, "the wider cap fits the full provider line at 12px");
});

test("the top right of the Playback System row stays empty, with no second logo and no hint", () => {
  assert.doesNotMatch(lyrion + lyrionCss, /playbackSystemLogo|playbackSystemHint|Independent [Pp]layers and [Qq]ueues/);
  assert.equal(fs.existsSync(path.join(publicDir, "assets", "rabbit-hole-logo.webp")), false);
});
