"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../public/styles.css"), "utf8");
const fn = (name) => {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  return app.slice(start, app.indexOf("\n}\n", start) + 2);
};
const context = {};
vm.runInNewContext(fn("sortedRadioEntries") + "\nthis.sorted = sortedRadioEntries;", context);
const stations = [{ title: "SomaFM: Groove Salad" }, { title: "Radio Paradise: Main Mix" }, { title: "SomaFM: Drone Zone" }];
const order = (sort) => JSON.parse(JSON.stringify(context.sorted(stations, sort))).map((e) => [e.station.title, e.index]);

test("Radio sorts by name without losing each station's place, so Play, Open and Move still act on the station shown", () => {
  assert.deepEqual(order("mine"), [["SomaFM: Groove Salad", 0], ["Radio Paradise: Main Mix", 1], ["SomaFM: Drone Zone", 2]]);
  assert.deepEqual(order("name"), [["Radio Paradise: Main Mix", 1], ["SomaFM: Drone Zone", 2], ["SomaFM: Groove Salad", 0]]);
  assert.deepEqual(order("name-desc"), [["SomaFM: Groove Salad", 0], ["SomaFM: Drone Zone", 2], ["Radio Paradise: Main Mix", 1]]);
});

test("Move only appears in My Order, since a name sort would hide where a moved station lands", () => {
  assert.match(app, /entries\.map\(\(entry, position\) => radioStationCardHtml\(entry\.station, entry\.index, position, radioSort === "mine"\)\)/);
  assert.match(app, /\$\{movable \? `<button type="button" class="radioStationDragButton"/);
  assert.match(app, /localStorage\.setItem\(RADIO_SORT_KEY, radioSort\)/);
  assert.match(html, /<label class="viewSort">Sort<select id="radioSort"><option value="mine">My Order<\/option><option value="name">Name A-Z<\/option><option value="name-desc">Name Z-A<\/option><\/select><\/label>/);
});

test("Radio lives under Listen and says what it is", () => {
  assert.match(html, /<button type="button" data-nav-group="playback" data-nav-item="radio" data-view="radio">Radio<\/button>/);
  assert.doesNotMatch(html, /data-nav-group="discover" data-nav-item="radio"/);
  assert.match(app, /radio: \{ group: "playback", item: "radio" \},/);
  assert.match(html, /<h2>Radio Stations<\/h2>\s*<p class="pageIntro">Live internet radio from Roon's My Live Radio\. Play a station on the selected Roon zone\. Drag a station, or use Move, to set your own order\.<\/p>/);
  assert.match(css, /\.pageIntro \{[^}]*max-width: 72ch;/);
});

test("Radio uses the shared Thumbnails | List switch, and List is one row per station", () => {
  assert.match(app, /\$\("#radioView \.radioHero \.resultActions"\)\?\.append\(window\.RabbitHoleViewControls\.layoutSwitch\(\{ key: "rabbitHole\.layout\.radio", name: "Station",/);
  assert.match(css, /#radioView\.radioListView \.radioStation \{[^}]*grid-template-areas: "art text actions";/);
});
