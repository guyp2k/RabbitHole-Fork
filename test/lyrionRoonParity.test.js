"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { LyrionClient } = require("../src/lyrionClient");
const { createLyrionApi } = require("../src/lyrionApi");

const read = file => fs.readFileSync(require.resolve(`../public/${file}`), "utf8");
const styles = read("styles.css"), css = read("lyrion.css"), source = read("lyrion.js");
const count = (text, needle) => text.split(needle).length - 1;

test("Lyrion buttons, selects and inputs take the shared control style instead of a Lyrion-only fill and height", () => {
  assert.doesNotMatch(css, /#lyrionView :is\(button,select,input\) \{/);
  assert.doesNotMatch(css, /#lyrionView button,#lyrionView select,#lyrionView input \{ min-height:44px; \}/);
  assert.doesNotMatch(css, /--lyrion-control:/);
});

test("the HQPlayer and Rouen link pills get the same desktop control rule as the pill buttons", () => {
  assert.equal(count(styles, "body:not(.playerFullWindow):not(.playerMaximized) :is(button, .buttonLink, .lyrionChoices a):not(.viewTabs button):not(.secondaryNavItems button)"), 3);
  assert.match(css, /\n:where\(\.hqplayerLinksBar,#playbackSystemLinks\) a \{/);
});

test("the Lyrion Player row is a bare row like the Roon Zone row, with Refresh Players as a pill", () => {
  assert.match(source, /<div id="lyrionPlayerBar" class="roonZoneBar"><label for="lyrionPlayer" class="roonZoneLabel">Lyrion Player<\/label><select id="lyrionPlayer">/);
  assert.match(source, /<span class="lyrionChoices lyrionRefreshChoice"><button id="lyrionRefresh" type="button">Refresh Players<\/button><\/span><\/div>/);
  assert.match(source, /\$\("lyrionPlayer"\)\.nextElementSibling\.id="lyrionPlayerChoices";/);
  assert.doesNotMatch(source, /class="panel lyrionToolbar"><label for="lyrionPlayer">/);
});

test("the Lyrion title, artist line and detail rows use the Roon player's sizes below and above 700px", () => {
  assert.match(styles, /\.player:is\(\.player--regular, \.player--maximized, \.player--fullscreen\) #nowTitle \{\n  margin-top: 5px;\n  color: #fff;\n  font-size: clamp\(24px, 2\.1vw, 32px\);\n  line-height: 1\.02;/);
  assert.match(css, /#lyrionView \.lyrionNow #lyrionTitle \{margin:5px 0 0;color:var\(--accent\);font-size:clamp\(24px,2\.1vw,32px\);letter-spacing:0;line-height:1\.02;\}/);
  assert.doesNotMatch(css, /#lyrionTitle \{[^}]*font-weight/);
  assert.match(styles, /\.nowInfo #nowTitle \{\n    font-size: clamp\(18px, 1\.55vw, 22px\);\n    line-height: 1\.06;/);
  assert.match(styles, /\.nowInfo #nowSubtitle \{\n    margin-top: 7px;\n    font-size: clamp\(13px, 1\.15vw, 16px\);\n    line-height: 1\.2;/);
  assert.match(styles, /\.now \.sourceRow \{\n    grid-template-columns: 124px minmax\(0, 1fr\);\n    gap: 8px;/);
  assert.match(css, /@media\(min-width:700px\)\{\n#lyrionView \.lyrionNow #lyrionTitle \{font-size:clamp\(18px,1\.55vw,22px\);line-height:1\.06;\}\n#lyrionView #lyrionArtist \{margin-top:7px;font-size:clamp\(13px,1\.15vw,16px\);line-height:1\.2;\}\n#lyrionView \.lyrionDetails \{gap:12px;\}\n\.lyrionDetails \.sourceRow \{grid-template-columns:124px minmax\(0,1fr\);gap:8px;\}\n\.lyrionDetails \.sourceLabel \{font-size:11\.5px;\}\n\.lyrionDetails \.sourceValue \{font-size:12px;overflow-wrap:normal;\}/);
  assert.match(styles, /\.player:is\(\.player--regular, \.player--maximized, \.player--fullscreen\) \.sourceRow \{\n  display: grid;\n  grid-template-columns: 118px minmax\(0, 1fr\);\n  gap: 12px;/);
  assert.match(css, /\.lyrionDetails \.sourceRow \{display:grid;grid-template-columns:118px minmax\(0,1fr\);gap:12px;align-items:start;\}/);
});

test("the artist line joins artist and album with a hyphen, like Roon's subtitle, and there is no separate album line", () => {
  assert.match(source, /setScrollingLabel\("lyrionArtist",\[t\?\.artist,t\?\.album\]\.filter\(Boolean\)\.join\(" - "\)\);/);
  assert.doesNotMatch(source, /lyrionAlbum/);
});

test("Lyrion detail rows are Roon source rows: a label and a value side by side in one grid row", () => {
  assert.match(source, /row\.className="sourceRow";dt\.className="sourceLabel";dd\.className="sourceValue";/);
});

test("Lyrion transport buttons start from the Roon transport's size, padding and weight", () => {
  assert.match(styles, /:is\(\.feedbackButton, \.nowDiscoveryActions button, \.nowTidalPlaylistCreate button, \.controls button\) \{\n  width: 100%;\n  min-width: 0;\n  min-height: 28px;\n  padding: 0 10px;[\s\S]*?font-size: 13px;\n  font-weight: 780;\n  line-height: 1\.05;/);
  assert.match(css, /#lyrionView \.lyrionNow \.lyrionStageFooter \.lyrionActions button \{width:100%;min-width:0;min-height:28px;padding:0 10px;[^}]*font-size:13px;font-weight:780;line-height:1\.05;\}/);
});

test("Lyrion panels share the Roon views' desktop and phone surfaces, except the Now Playing stage", () => {
  assert.equal(count(styles, ":is(:where(#lyrionView .lyrionTabPanel:not(#lyrionPanel-now)), :is(\n    #queueView,"), 5);
  assert.equal(count(styles, ":is(.view.isActive:not(#playerView), :where(#lyrionView .lyrionTabPanel:not(#lyrionPanel-now)))"), 7);
  assert.doesNotMatch(css, /#lyrionView \.panel \{/);
  assert.doesNotMatch(css, /#lyrionView h2 \{ color:var\(--accent\); \}/);
});

test("the Lyrion queue renders Roon queue rows, and tapping a row plays from that position", () => {
  assert.match(source, /<section class="liveQueue"><div class="liveQueueHead"><strong>Lyrion queue<\/strong><span id="lyrionQueueCount"><\/span><\/div><ol id="lyrionQueue"><\/ol><\/section>/);
  assert.match(source, /b\.type="button";b\.className="queueItemButton";b\.title="Play from here";/);
  assert.match(source, /b\.onclick=run\(async\(\)=>\{await api\("control",\{action:"jump",index:t\.index\}\);await refreshStatus\(\);\}\);/);
});

test("a queue jump asks LMS for that playlist index, and refuses a position that is not a whole number from 0", async () => {
  const client = new LyrionClient({ baseUrl: "http://lms.test:9000" });
  const sent = [];
  client.rpc = async (player, command) => { sent.push([player, command]); return {}; };
  await client.control("p", "jump", 3);
  assert.deepEqual(sent, [["p", ["playlist", "index", "3"]]]);
  for (const bad of [-1, 1.5, "2", undefined]) await assert.rejects(client.control("p", "jump", bad), /Choose a queue position\./);
  assert.equal(sent.length, 1);
});

test("the control route passes the index only for a jump, and a jump hands playback to Lyrion like Play", async () => {
  const calls = [], paused = [];
  const roon = { getState: () => ({ zones: [{ zone_id: "z", display_name: "Zone", state: "playing" }] }), control: async (id, action) => { paused.push([id, action]); } };
  const client = { requirePlayer: async () => {}, control: async (...args) => { calls.push(args); return {}; }, players: async () => [] };
  let body = { action: "jump", playerId: "p", index: 2 };
  const api = createLyrionApi({ roon, client, file: "does-not-exist", readJson: async () => body, sendJson: () => {} });
  const url = new URL("http://localhost:3777/api/lyrion/control");
  await api.handle({ method: "POST", headers: {} }, {}, url);
  body = { action: "pause", playerId: "p", index: 2 };
  await api.handle({ method: "POST", headers: {} }, {}, url);
  assert.deepEqual(calls, [["p", "jump", 2], ["p", "pause"]]);
  assert.deepEqual(paused, [["z", "pause"]]);
});

test("Lyrion result rows use the Roon queue's art cell, title and subtitle styles", () => {
  assert.match(source, /row\.className="queueItemStatic lyrionResultRow";/);
  assert.match(source, /actions\.className="lyrionActions playlistBrowserActions";/);
  assert.match(styles, /\.liveQueue li strong,\n\.lyrionResultList li strong \{\n  color: #fff;\n  font-size: 14px;/);
  assert.match(styles, /\.liveQueue li small,\n\.lyrionResultList li small \{\n  color: rgba\(224, 207, 255, 0\.72\);\n  font-size: 12px;/);
});

test("list artwork has no lazy loading, because a lazy image that stays hidden until it loads never loads", () => {
  assert.match(source, /const img=document\.createElement\("img"\);img\.alt="";artworkImage\(img,url\);/);
  assert.doesNotMatch(source, /img\.loading="lazy"/);
});

test("the Roon primary nav keeps its Now Playing size on every view, not only while Now Playing is open", () => {
  assert.doesNotMatch(styles, /body:has\(#playerView\.isActive > \.layout > \.player\.player--regular:not\(\.isMaximized\):not\(\.isFullWindow\)\) \.viewTabs/);
  assert.match(styles, /body:not\(\.playerFullWindow\):not\(\.playerMaximized\) \.viewTabs :is\(a, button\) \{\n    display: flex;[\s\S]*?min-height: 44px;[\s\S]*?font-size: 11px;[\s\S]*?text-transform: uppercase;/);
});

test("on a phone the Roon primary nav wraps to a second row instead of overlapping its labels", () => {
  assert.match(styles, /@media \(max-width: 699px\) \{\n  body:not\(\.playerFullWindow\):not\(\.playerMaximized\) \.viewTabs\.primaryNav \{\n    flex-wrap: wrap;\n    width: 100%;\n  \}\n\n  body:not\(\.playerFullWindow\):not\(\.playerMaximized\) \.viewTabs\.primaryNav button \{\n    min-height: 44px;\n    flex: 1 1 auto;\n    min-width: max-content;/);
});

test("on a phone Lyrion shows the track details before the artwork, like Roon", () => {
  assert.doesNotMatch(css, /\.lyrionArtworkLane \{grid-row:2;\}/);
});

test("the compact Now playing bar joins title and artist with a hyphen, not a dash", () => {
  assert.match(source, /\$\("lyrionCompactTitle"\)\.textContent=\[t\?\.title,t\?\.artist\]\.filter\(Boolean\)\.join\(" - "\);/);
});
