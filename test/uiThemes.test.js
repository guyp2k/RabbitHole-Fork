"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createThemes, mapColor, themeFromCookie } = require("../src/uiThemes");

const THEMES_DIR = path.join(__dirname, "..", "src", "themes");
const themes = createThemes({ themesDir: THEMES_DIR, defaultTheme: "original" });
const rules = (id) => JSON.parse(fs.readFileSync(path.join(THEMES_DIR, `${id}.json`), "utf8")).rules;

function hsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
  if (d === 0) return { h: null, s: 0, l };
  const h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return { h, s: l > 0.5 ? d / (2 - max - min) : d / (max + min), l };
}

function publicDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "themes-"));
  fs.mkdirSync(path.join(dir, "themes", "copper", "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "styles.css"), ":root{--accent:#d9b3ff;--bg:#05020b}");
  fs.writeFileSync(path.join(dir, "app.js"), 'x = "#d9b3ff";');
  fs.writeFileSync(path.join(dir, "themes", "copper", "assets", "art.jpg"), "copper art");
  fs.writeFileSync(path.join(dir, "themes", "secret.txt"), "x");
  return dir;
}

test("every bundled theme is listed with its label and the default is reported", () => {
  const listed = themes.list();
  assert.deepEqual(listed.themes.map((t) => t.id).sort(), ["copper", "original", "roon"]);
  assert.equal(listed.themes.find((t) => t.id === "copper").label, "Obsidian & Copper");
  assert.equal(listed.default, "original");
});

test("an unknown default theme falls back to the original look", () => {
  assert.equal(createThemes({ themesDir: THEMES_DIR, defaultTheme: "nope" }).list().default, "original");
});

test("copper turns the lavender accent copper and the pink accent gold", () => {
  assert.ok(Math.abs(hsl(mapColor("#d9b3ff", rules("copper"))).h - 38) < 2);
  assert.ok(Math.abs(hsl(mapColor("#ff73d8", rules("copper"))).h - 46) < 2);
});

test("roon turns tinted darks into lifted neutral greys and accents periwinkle", () => {
  const bg = hsl(mapColor("#05020b", rules("roon")));
  assert.ok(bg.s <= 0.04 && bg.l > hsl("#05020b").l + 0.04, JSON.stringify(bg));
  assert.ok(Math.abs(hsl(mapColor("#a77cff", rules("roon"))).h - 237) < 3);
  assert.ok(Math.abs(hsl(mapColor("#d9b3ff", rules("roon"))).h - 237) < 3, "the main accent stays periwinkle");
  const text = mapColor("#faf6ff", rules("roon")).match(/[0-9a-f]{2}/g).map((v) => parseInt(v, 16));
  assert.ok(Math.max(...text) - Math.min(...text) <= 3, "near-white text goes neutral");
  assert.ok(hsl(mapColor("#8ff0ff", rules("roon"))).s <= 0.07);
});

test("colour formats and alpha survive a remap and greys are untouched", () => {
  assert.match(mapColor("rgba(217, 179, 255, 0.12)", rules("copper")), /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, 0\.12\)$/);
  assert.match(mapColor("#a7f", rules("copper")), /^#[0-9a-f]{6}$/);
  for (const c of ["#fff", "#555", "rgba(255, 255, 255, 0.06)"]) assert.equal(mapColor(c, rules("roon")), c);
});

test("the original theme changes nothing", () => {
  assert.equal(mapColor("#d9b3ff", rules("original")), "#d9b3ff");
});

test("the theme cookie is read among other cookies and malformed values are ignored", () => {
  assert.equal(themeFromCookie("a=1; rh_theme=roon; b=2"), "roon");
  for (const header of [undefined, "", "a=1", "rh_theme=", "rh_theme=../etc", "rh_theme=Roon"]) assert.equal(themeFromCookie(header), null);
});

test("stylesheets are recoloured for the cookie's theme and other files are served as they are", () => {
  const dir = publicDir();
  const css = fs.readFileSync(path.join(dir, "styles.css"));
  const out = themes.render(dir, path.join(dir, "styles.css"), css, "rh_theme=copper").toString();
  assert.doesNotMatch(out, /#d9b3ff|#05020b/);
  assert.equal(themes.render(dir, path.join(dir, "styles.css"), css, "rh_theme=original").toString(), css.toString());
  assert.equal(themes.render(dir, path.join(dir, "styles.css"), css, undefined).toString(), css.toString());
  const js = fs.readFileSync(path.join(dir, "app.js"));
  assert.equal(themes.render(dir, path.join(dir, "app.js"), js, "rh_theme=copper"), js);
  fs.rmSync(dir, { recursive: true });
});

test("a theme's own artwork replaces the default file and cannot escape its folder", () => {
  const dir = publicDir();
  assert.equal(themes.assetPath(dir, "/assets/art.jpg", "rh_theme=copper"), path.join(dir, "themes", "copper", "assets", "art.jpg"));
  assert.equal(themes.assetPath(dir, "/assets/art.jpg", "rh_theme=roon"), null);
  assert.equal(themes.assetPath(dir, "/../secret.txt", "rh_theme=copper"), null);
  assert.equal(themes.assetPath(dir, "/assets/art.jpg", "rh_theme=nope"), null);
  fs.rmSync(dir, { recursive: true });
});

test("the default theme applies when no cookie is set", () => {
  const dir = publicDir();
  const copperDefault = createThemes({ themesDir: THEMES_DIR, defaultTheme: "copper" });
  const css = fs.readFileSync(path.join(dir, "styles.css"));
  assert.doesNotMatch(copperDefault.render(dir, path.join(dir, "styles.css"), css, undefined).toString(), /#d9b3ff/);
  assert.equal(copperDefault.assetPath(dir, "/assets/art.jpg", undefined), path.join(dir, "themes", "copper", "assets", "art.jpg"));
  assert.match(copperDefault.render(dir, path.join(dir, "styles.css"), css, "rh_theme=original").toString(), /#d9b3ff/);
  fs.rmSync(dir, { recursive: true });
});
