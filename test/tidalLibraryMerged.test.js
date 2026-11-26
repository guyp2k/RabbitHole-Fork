"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const shell = fs.readFileSync(require.resolve("../public/modernShell.js"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");

test("TIDAL playlist cards on Playlists offer the .m3u and .csv downloads that TIDAL Library had", () => {
  assert.match(app, /\$\{isTidal \? `<a class="buttonLink" href="\$\{escapeHtml\(tidalExportHref\(playlist, "m3u"\)\)\}" download>Download \.m3u<\/a><a class="buttonLink" href="\$\{escapeHtml\(tidalExportHref\(playlist, "csv"\)\)\}" download title="Track list for ChatGPT recommendations">Download \.csv<\/a>` : ""\}/);
  assert.match(app, /return `\/api\/tidal\/export\?id=\$\{encodeURIComponent\(id\)\}&title=\$\{encodeURIComponent\(title\)\}&format=\$\{safeFormat\}`;/);
});

test("TIDAL mix cards on Discover > TIDAL offer the same downloads", () => {
  assert.match(app, /<a class="buttonLink" href="\$\{escapeHtml\(tidalExportHref\(mix, "m3u"\)\)\}" download>Download \.m3u<\/a>\s*<a class="buttonLink" href="\$\{escapeHtml\(tidalExportHref\(mix, "csv"\)\)\}" download title="Track list for ChatGPT recommendations">Download \.csv<\/a>/);
});

test("the TIDAL Library page, its navigation group, code and styles are gone", () => {
  assert.doesNotMatch(html, /tidalLibrary|TidalLibrary/);
  assert.doesNotMatch(app, /tidalLibrary|TidalLibrary/);
  assert.doesNotMatch(css, /tidalLibrary/);
  for (const theme of fs.readdirSync(require("node:path").join(__dirname, "../public/themes"))) {
    const file = require("node:path").join(__dirname, "../public/themes", theme, "theme.css");
    if (fs.existsSync(file)) assert.doesNotMatch(fs.readFileSync(file, "utf8"), /tidalLibrary/, `${theme} still styles TIDAL Library`);
  }
  assert.match(shell, /\{ id: "discover", label: "Discover", groups: \["discover"\] \},/);
  assert.match(css, /\.viewTabs\.primaryNav \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
});
