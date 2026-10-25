"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { RoonClient } = require("../src/roonClient");
const { LyrionClient } = require("../src/lyrionClient");

const read = (name) => fs.readFileSync(require.resolve(`../public/${name}`), "utf8");
const card = (() => { const context = { document: {} }; context.window = context; vm.runInNewContext(read("playerCard.js"), context); return context; })();

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const to = source.indexOf(end, from);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

test("the player card shows elapsed time on the left and time remaining on the right", () => {
  const view = card.playerCardView({ state: "playing", duration: 312, position: 104, canSeek: true });
  assert.deepEqual([view.elapsed, view.remaining, view.seekMax, view.seekValue, view.seekable, view.playing], ["1:44", "-3:28", 312, 104, true, true]);
  assert.deepEqual([card.playerCardView({ duration: 3725, position: 5 }).remaining], ["-1:02:00"]);
});

test("the player card cannot seek a live stream or a zone that refuses seeking", () => {
  assert.equal(card.playerCardView({ duration: 0, position: 40, canSeek: true }).seekable, false);
  assert.equal(card.playerCardView({ duration: 0, position: 40 }).elapsed, "");
  assert.equal(card.playerCardView({ duration: 200, position: 40, canSeek: false }).seekable, false);
});

test("the player card hides the volume row without a volume, and the slider for step-only volume", () => {
  assert.equal(card.playerCardView({ volume: null }).volumeShown, false);
  const stepOnly = card.playerCardView({ volume: { value: null, canMute: true } });
  assert.deepEqual([stepOnly.volumeShown, stepOnly.sliderShown, stepOnly.canMute], [true, false, true]);
  const db = card.playerCardView({ volume: { value: -20, min: -80, max: 0, type: "db", muted: true, canMute: true } });
  assert.deepEqual([db.volumeText, db.muted, db.volumeMin, db.volumeMax], ["-20 dB", true, -80, 0]);
});

test("the player card names the system and room and falls back to Nothing playing", () => {
  const view = card.playerCardView({ system: "Lyrion", room: "Kitchen", state: "paused" });
  assert.deepEqual([view.roomLine, view.title, view.stateLabel, view.playing], ["Lyrion · Kitchen", "Nothing playing", "Paused", false]);
});

test("a Lyrion status becomes a player card with its art, position and mute state", () => {
  const status = { playerName: "Kitchen", connected: true, state: "playing", position: 71, duration: 231, canSeek: true,
    nowPlaying: { title: "Lamplighter", artist: "Ada Vireo", album: "Small Hours", artwork: "/api/lyrion/artwork?path=x" },
    volume: { type: "number", min: 0, max: 100, step: 1, value: 45, is_muted: true } };
  const result = card.playerCardFromLyrion(status);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { system: "Lyrion", room: "Kitchen", state: "playing", title: "Lamplighter", artist: "Ada Vireo", album: "Small Hours",
    art: "/api/lyrion/artwork?path=x", position: 71, duration: 231, canSeek: true, volume: { value: 45, min: 0, max: 100, step: 1, type: "number", muted: true, canMute: true } });
  assert.equal(card.playerCardFromLyrion({ ...status, connected: false }).state, "stopped");
});

function roonCard() {
  const context = { summarizeNowPlaying: (zone) => zone.summary || null };
  vm.runInNewContext(`${section(read("app.js"), "function roonPlayerCardState(zone) {", "const roonPlayerCard = {")}\nthis.roonPlayerCardState = roonPlayerCardState;`, context);
  return context.roonPlayerCardState;
}

test("a Roon zone becomes a player card with its art, seek limits and the output that owns the volume", () => {
  const zone = { display_name: "Living Room", state: "playing", is_seek_allowed: true, summary: { title: "Harbor Lights", artist: "The Quiet Meridian", album: "Low Tide Signals" },
    now_playing: { image_key: "abc/1", seek_position: 104, length: 312 },
    outputs: [{ output_id: "o-fixed" }, { output_id: "o-vol", volume: { type: "number", value: 38, min: 0, max: 100, step: 1, is_muted: false } }] };
  const result = JSON.parse(JSON.stringify(roonCard()(zone)));
  assert.deepEqual(result, { system: "Roon", room: "Living Room", state: "playing", title: "Harbor Lights", artist: "The Quiet Meridian", album: "Low Tide Signals",
    art: "/api/roon/image/abc%2F1?width=600&height=600", position: 104, duration: 312, canSeek: true,
    volume: { value: 38, min: 0, max: 100, step: 1, type: "number", muted: false, canMute: true, outputId: "o-vol" } });
});

test("a Roon zone without volume or seeking gives a card with neither", () => {
  const result = roonCard()({ display_name: "Studio", state: "stopped", is_seek_allowed: false, now_playing: { length: 200 }, outputs: [{ output_id: "o" }] });
  assert.deepEqual([result.volume, result.canSeek, result.art, result.title], [null, false, "", ""]);
  assert.throws(() => roonCard()(undefined), /no longer available/);
});

test("Roon mute and unmute go to the output's transport, and an unknown output is refused", async () => {
  const calls = [];
  const client = Object.create(RoonClient.prototype);
  const output = { output_id: "o-vol" };
  client.transport = { mute: (target, how, done) => { calls.push([target, how]); done(false, {}); } };
  client.zones = new Map([["z1", { outputs: [output] }]]);
  await client.mute("o-vol", true);
  await client.mute("o-vol", false);
  assert.deepEqual(calls, [[output, "mute"], [output, "unmute"]]);
  await assert.rejects(client.mute("missing", true), /Unknown output: missing/);
});

test("Lyrion mute and unmute send the mixer muting command, and volume levels still work", async () => {
  const calls = [];
  const client = new LyrionClient({ fetchImpl: async (url, options) => { calls.push(JSON.parse(options.body).params); return { ok: true, json: async () => ({ result: {} }) }; } });
  await client.setVolume("p", { mute: true });
  await client.setVolume("p", { mute: false });
  await client.setVolume("p", { value: 40 });
  assert.deepEqual(calls, [["p", ["mixer", "muting", "1"]], ["p", ["mixer", "muting", "0"]], ["p", ["mixer", "volume", "40"]]]);
});

test("the Roon mute route is wired to the client and tells open pages about the change", () => {
  const server = fs.readFileSync(require.resolve("../src/server.js"), "utf8");
  assert.match(server, /if \(pathname === "\/api\/mute"\) \{\s*const result = await roon\.mute\(body\.outputId, body\.mute === true\);\s*scheduleBroadcast\(\);/);
});

function lyrionChoices(openCard) {
  const make = (tag) => ({ tag, children: [], attributes: {}, className: "", textContent: "", hidden: false,
    setAttribute(name, value) { this.attributes[name] = String(value); }, getAttribute(name) { return this.attributes[name]; },
    append(...nodes) { this.children.push(...nodes); }, replaceChildren(...nodes) { this.children = nodes; }, after(node) { this.next = node; } });
  const select = { options: [{ value: "", textContent: "Choose" }, { value: "p1", textContent: "Kitchen" }, { value: "p2", textContent: "Office" }], value: "p1", hidden: false,
    events: [], addEventListener() {}, dispatchEvent(event) { this.events.push(event.type); }, after(node) { this.group = node; } };
  const context = { document: { createElement: make, querySelector: () => null }, MutationObserver: class { observe() {} }, Event: class { constructor(type) { this.type = type; } }, $: () => select };
  vm.runInNewContext(`${section(read("lyrion.js"), "  function choices(selectId,label,openCard){", "  const setupMenu=")}\nthis.choices = choices;`, context);
  context.choices("lyrionPlayer", "Lyrion Player", openCard);
  return select;
}

test("each Lyrion player pill has a button that opens that player's card without switching players", () => {
  const opened = [];
  const select = lyrionChoices((id) => opened.push(id));
  const [first, second] = select.group.children;
  assert.deepEqual([first.className, second.children[0].textContent, second.children[1].textContent], ["choiceWithCard", "Office", "▸"]);
  assert.equal(second.children[1].getAttribute("aria-label"), "Open Office controls");
  second.children[1].onclick();
  assert.deepEqual([opened, select.value, select.events], [["p2"], "p1", []]);
});

test("pill rows without a card opener stay plain buttons", () => {
  const select = lyrionChoices(undefined);
  assert.deepEqual(select.group.children.map((child) => [child.tag, child.textContent]), [["button", "Kitchen"], ["button", "Office"]]);
});

test("the page loads the player card before the app and both pill rows can open it", () => {
  const html = read("index.html");
  assert.ok(html.indexOf('src="/playerCard.js') > -1 && html.indexOf('src="/playerCard.js') < html.indexOf('src="/app.js'));
  assert.match(read("app.js"), /window\.openRoonPlayerCard = \(zoneId\) => window\.openPlayerCard\?\.\(roonPlayerCard, zoneId\);/);
  assert.match(read("lyrion.js"), /choices\('lyrionPlayer','Lyrion Player',id=>window\.openPlayerCard\?\.\(lyrionPlayerCard,id\)\)/);
});

function fakeElement() {
  return { attributes: {}, listeners: {}, classes: [], title: "",
    setAttribute(name, value) { this.attributes[name] = String(value); },
    classList: null, addEventListener(type, fn) { this.listeners[type] = fn; } };
}

test("tapping the Now Playing art, or pressing Enter or Space on it, opens the player card", () => {
  const element = fakeElement();
  element.classList = { add: (name) => element.classes.push(name) };
  let opened = 0;
  card.makePlayerCardTrigger(element, () => opened++);
  assert.deepEqual([element.attributes.role, element.attributes.tabindex, element.attributes["aria-label"], element.classes], ["button", "0", "Open player controls", ["playerCardTrigger"]]);
  element.listeners.click();
  let prevented = 0;
  for (const key of ["Enter", " ", "a", "Tab"]) element.listeners.keydown({ key, preventDefault: () => prevented++ });
  assert.deepEqual([opened, prevented], [3, 2]);
});

test("the Roon art opens the card for the zone on screen and the Lyrion art for the selected player", () => {
  assert.match(read("app.js"), /window\.makePlayerCardTrigger\?\.\(\$\("#cover"\), \(\) => \{ const zone = activeZone\(\); if \(zone\) window\.openRoonPlayerCard\(zone\.zone_id\); \}\);/);
  assert.match(read("lyrion.js"), /window\.makePlayerCardTrigger\?\.\(\$\("lyrionCover"\),\(\)=>\{if\(player\)window\.openPlayerCard\?\.\(lyrionPlayerCard,player\);\}\);/);
});
