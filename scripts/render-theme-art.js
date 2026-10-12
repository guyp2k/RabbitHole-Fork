#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { remapPixels } = require("../src/uiThemes");

const ROOT = path.join(__dirname, "..");
const ART = "assets/rabbit-hole-fallback.jpg";
const MARK = "assets/rabbit-hole-mark.png";
const MARK_CROP = "812x812+235+69";
const MARK_SIZE = 168;

function pixels(source) {
  const [width, height] = execFileSync("identify", ["-format", "%w %h", source], { encoding: "utf8" }).trim().split(" ");
  return { size: `${width}x${height}`, raw: execFileSync("convert", [source, "-depth", "8", "rgb:-"], { maxBuffer: 1 << 28 }) };
}

function write(target, { size, raw }, args) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  execFileSync("convert", ["-size", size, "-depth", "8", "rgb:-", ...args, "-strip", target], { input: raw });
}

function renderMark(target, image) {
  const r = MARK_SIZE / 2;
  write(target, image, [
    "-crop", MARK_CROP, "+repage", "-filter", "Lanczos", "-resize", `${MARK_SIZE}x${MARK_SIZE}`, "-unsharp", "0x0.6+0.8+0.01",
    "(", "-size", `${MARK_SIZE}x${MARK_SIZE}`, "xc:none", "-fill", "white", "-draw", `circle ${r - 0.5},${r - 0.5} ${r - 0.5},0.5`, ")",
    "-compose", "CopyOpacity", "-composite", "-define", "png:compression-level=9"
  ]);
}

const original = pixels(path.join(ROOT, "public", ART));
renderMark(path.join(ROOT, "public", MARK), original);
console.log(`rendered public/${MARK}`);

for (const name of fs.readdirSync(path.join(ROOT, "src", "themes")).filter((n) => n.endsWith(".json"))) {
  const theme = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "themes", name), "utf8"));
  const rules = theme.artRules || theme.rules;
  if (!rules.length) continue;
  const recoloured = { size: original.size, raw: remapPixels(Buffer.from(original.raw), 3, rules) };
  for (const [art, render] of [[ART, (target) => write(target, recoloured, ["-quality", "75"])], [MARK, (target) => renderMark(target, recoloured)]]) {
    const target = path.join(ROOT, "public", "themes", theme.id, art);
    render(target);
    console.log(`rendered ${path.relative(ROOT, target)}`);
  }
}
