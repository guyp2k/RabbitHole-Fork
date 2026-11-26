"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.join(__dirname, "..", "public");
const SMALL_WORDS = new Set(["a", "an", "and", "or", "of", "to", "the", "in", "on", "for", "by", "with", "at", "from", "per", "vs", "via", "as", "amp"]);
const SENTENCE_PREFIXES = new Set(["Rating not saved:", "Loading shows from"]);
const ELEMENT_TEXT = /<(button|h2|h3|h4|label|summary|option|th|legend)\b[^>]*>([^<${}]{3,60})</g;
const SCRIPT_LABEL = /(?:textContent\s*=\s*|button\(|new Option\()\s*["'`]([A-Z][^"'`${}]{3,50})["'`]/g;

function lowercaseLabels(source) {
  const found = [];
  for (const match of [...source.matchAll(ELEMENT_TEXT)].map((m) => m[2]).concat([...source.matchAll(SCRIPT_LABEL)].map((m) => m[1]))) {
    const text = match.trim();
    if (SENTENCE_PREFIXES.has(text) || /[.…?!]$/.test(text) || text.split(/\s+/).length < 2) continue;
    const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
    if (words.slice(1).some((word) => /^[a-z]/.test(word) && !SMALL_WORDS.has(word.toLowerCase()))) found.push(text);
  }
  return found;
}

test("the label check catches a lowercase label and lets Title Case, small words and sentences through", () => {
  assert.deepEqual(lowercaseLabels('<button type="button">Refresh playlists</button>'), ["Refresh playlists"]);
  assert.deepEqual(lowercaseLabels('<button type="button">Add to Queue</button><option>Loved &amp; Liked</option>'), []);
  assert.deepEqual(lowercaseLabels("b.textContent = 'Saved to your playlist.'"), []);
  assert.deepEqual(lowercaseLabels("actions.append(button('Play next', run))"), ["Play next"]);
});

test("every button, heading, label, option and table header in the app is Title Case", () => {
  const offenders = [];
  for (const name of fs.readdirSync(publicDir).filter((file) => /\.(js|html)$/.test(file))) {
    for (const label of lowercaseLabels(fs.readFileSync(path.join(publicDir, name), "utf8"))) offenders.push(`${name}: ${label}`);
  }
  assert.deepEqual(offenders, []);
});
