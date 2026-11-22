"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../public/modernShell.js"), "utf8");
const html = fs.readFileSync(require.resolve("../public/index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../public/modern.css"), "utf8");

class Event { constructor(type) { this.type = type; } }

function load({ modern = false } = {}) {
  const created = [];
  const document = {
    body: { classList: { contains: (name) => modern && name === "layoutModern" }, append: () => { throw new Error("Classic must not get Modern chrome"); } },
    createElement: (tag) => { created.push(tag); throw new Error("Classic must not build Modern chrome"); },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const context = { document, Event };
  context.window = context;
  let error = null;
  try {
    vm.runInNewContext(source, context);
  } catch (caught) {
    error = caught.message;
  }
  const plain = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
  const shell = context.RabbitHoleModernShell && Object.fromEntries(Object.entries(context.RabbitHoleModernShell).map(([name, fn]) => [name, (...args) => plain(fn(...args))]));
  return { shell, created, error };
}

const { shell } = load();

const decode = (text) => text.replace(/&amp;/g, "&");
const secondaryNav = html.slice(html.indexOf('<nav class="secondaryNav"'), html.indexOf("</nav>", html.indexOf('<nav class="secondaryNav"')));
const navItems = [...secondaryNav.matchAll(/<button type="button"[^>]*data-nav-group="(\w+)" data-nav-item="([\w-]+)" data-view="(\w+)"[^>]*>([^<]+)<\/button>/g)]
  .map(([, group, item, view, label]) => ({ group, item, view, label: decode(label) }));
const primaryNav = html.slice(html.indexOf('<nav class="viewTabs primaryNav"'), html.indexOf("</nav>", html.indexOf('<nav class="viewTabs primaryNav"')));
const primaryLabels = Object.fromEntries([...primaryNav.matchAll(/data-nav-group="(\w+)"[^>]*>([^<]+)<\/button>/g)].map(([, group, label]) => [group, decode(label)]));
const viewHeading = (view) => {
  const at = html.indexOf(`<section id="${view}View"`);
  if (at === -1) return "";
  return decode(/<h2[^>]*>([^<]*)<\/h2>/.exec(html.slice(at))[1]);
};

function select(options, value) {
  const events = [];
  return {
    options: options.map(([v, textContent]) => ({ value: v, textContent })), value,
    dispatchEvent(event) { events.push([event.type, this.value]); }, events
  };
}

test("Classic builds no Modern chrome at all, so the classic page is untouched", () => {
  const { shell: exported, created, error } = load({ modern: false });
  assert.deepEqual(created, []);
  assert.equal(error, null);
  assert.equal(typeof exported.railSections, "function");
});

test("the rail groups every existing navigation destination exactly once into Listen, Discover, You and System", () => {
  const sections = shell.railSections(navItems, primaryLabels, viewHeading);
  assert.deepEqual(sections.map((s) => [s.id, s.label, s.items.map((i) => [i.label, i.view])]), [
    ["listen", "Listen", [["Now Playing", "player"], ["Queue", "queue"], ["Playlists", "playlists"], ["Library", "roonLibrary"], ["Database", "database"]]],
    ["discover", "Discover", [["Rabbit Hole", "discover"], ["Standby", "standby"], ["Sonic Review", "sonicReview"], ["Beatport", "beatportCharts"], ["Radio", "radio"], ["TIDAL", "tidal"], ["TIDAL Library", "tidalLibrary"]]],
    ["you", "You", [["Music Memory", "musicMemory"], ["Taste", "history"], ["Synapse Memory", "memory"]]],
    ["system", "System", [["Connections", "connections"], ["AI", "ai"], ["Diagnostics", "diagnostics"], ["Settings", "settings"]]]
  ]);
  const railed = sections.flatMap((s) => s.items).map((i) => `${i.group}:${i.item}:${i.view}`).sort();
  assert.deepEqual(railed, navItems.map((i) => `${i.group}:${i.item}:${i.view}`).sort(), "one rail item per existing nav button, no more, no fewer");
});

test("a navigation group the rail does not know still gets a rail section instead of being dropped", () => {
  const sections = shell.railSections([...navItems, { group: "labs", item: "x", view: "labsView", label: "Experiments" }], { ...primaryLabels, labs: "Labs" }, viewHeading);
  assert.equal(sections.length, 5, "the four known sections plus one for the new group");
  assert.deepEqual(sections.at(-1).items.map((i) => i.label), ["Experiments"]);
  assert.equal(sections.at(-1).label, "Labs");
});

test("Lyrion's own sections become rail items with Title Case labels, keyed to their existing tab buttons", () => {
  const tabs = [["lyrionTab-home", "Home"], ["lyrionTab-now", "Now playing"], ["lyrionTab-artists", "Artist stations"], ["lyrionTab-xtra", "Xtra channels"]]
    .map(([id, textContent]) => ({ id, textContent }));
  assert.deepEqual(shell.lyrionRailItems(tabs), [
    { tab: "lyrionTab-home", label: "Home" }, { tab: "lyrionTab-now", label: "Now Playing" },
    { tab: "lyrionTab-artists", label: "Artist Stations" }, { tab: "lyrionTab-xtra", label: "Xtra Channels" }
  ]);
});

test("the rail switch lists the existing playback systems and marks the selected one", () => {
  const systems = select([["roon", "Roon"], ["lyrion", "Lyrion"]], "lyrion");
  assert.deepEqual(shell.systemChoices(systems), [{ value: "roon", label: "Roon", pressed: false }, { value: "lyrion", label: "Lyrion", pressed: true }]);
});

test("the rail switch drives the existing Playback System select and tells the app it changed", () => {
  const systems = select([["roon", "Roon"], ["lyrion", "Lyrion"]], "roon");
  shell.chooseSystem(systems, "lyrion");
  assert.equal(systems.value, "lyrion");
  assert.deepEqual(systems.events, [["change", "lyrion"]]);
  shell.chooseSystem(systems, "nope");
  assert.equal(systems.value, "lyrion", "a value the select does not offer is ignored");
  assert.deepEqual(systems.events, [["change", "lyrion"]]);
});

test("the Roon zone menu lists the zones from the app's zone select and names the selected zone", () => {
  const zones = select([["z1", "HQPd"], ["z2", "Kitchen Speaker"]], "z2");
  assert.deepEqual(shell.deviceMenu("roon", zones), {
    label: "Zone: Kitchen Speaker",
    items: [{ id: "z1", name: "HQPd", selected: false }, { id: "z2", name: "Kitchen Speaker", selected: true }]
  });
  assert.deepEqual(shell.deviceMenu("roon", select([], "")), { label: "Zone: None", items: [] });
});

test("the Lyrion player menu lists the players from Lyrion's player select, without its placeholder", () => {
  const players = select([["", "Choose a player"], ["p1", "Living Room"], ["p2", "Bedroom (offline)"]], "p1");
  assert.deepEqual(shell.deviceMenu("lyrion", players), {
    label: "Player: Living Room",
    items: [{ id: "p1", name: "Living Room", selected: true }, { id: "p2", name: "Bedroom (offline)", selected: false }]
  });
  players.value = "";
  assert.equal(shell.deviceMenu("lyrion", players).label, "Player: None");
});

test("picking a zone or player in the menu selects it in the existing select and tells the app", () => {
  const zones = select([["z1", "HQPd"], ["z2", "Kitchen Speaker"]], "z1");
  shell.chooseDevice(zones, "z2");
  assert.equal(zones.value, "z2");
  assert.deepEqual(zones.events, [["change", "z2"]]);
});

test("the menu's controls button opens the existing player card without switching zone or player", () => {
  const zones = select([["z1", "HQPd"], ["z2", "Kitchen Speaker"]], "z1");
  const opened = [];
  shell.openDeviceControls("roon", "z2", zones, { openRoonPlayerCard: (id) => opened.push(id), lyrionOpeners: [] });
  assert.deepEqual(opened, ["z2"]);
  assert.deepEqual(zones.events, []);
  const players = select([["", "Choose a player"], ["p1", "Living Room"], ["p2", "Bedroom"]], "p1");
  const clicks = [];
  const openers = ["p1", "p2"].map((id) => ({ click: () => clicks.push(id) }));
  shell.openDeviceControls("lyrion", "p2", players, { openRoonPlayerCard: () => assert.fail("Roon card for a Lyrion player"), lyrionOpeners: openers });
  assert.deepEqual(clicks, ["p2"], "the Lyrion row's own ▸ button for that player is used");
  assert.equal(players.value, "p1");
});

test("the Links menu carries the configured Rouen and HQPlayer links, as today, and nothing when none are configured", () => {
  const a = (textContent, href) => ({ textContent, href });
  assert.deepEqual(shell.menuLinks([a("Rouen ↗", "http://rouen/")], [a("Web Interface ↗", "http://hqp/"), a("HQPTuner ↗", "http://tuner/"), a("HQPweb ↗", "http://web/")]), [
    { label: "", links: [{ label: "Rouen", href: "http://rouen/" }] },
    { label: "HQPlayer", links: [{ label: "Web Interface", href: "http://hqp/" }, { label: "HQPTuner", href: "http://tuner/" }, { label: "HQPweb", href: "http://web/" }] }
  ]);
  assert.deepEqual(shell.menuLinks([], [a("HQPweb ↗", "http://web/")]), [{ label: "HQPlayer", links: [{ label: "HQPweb", href: "http://web/" }] }]);
  assert.deepEqual(shell.menuLinks([], []), []);
});

test("Lyrion's position line splits into the bar's elapsed and total times", () => {
  assert.deepEqual(shell.splitTime("1:01 / 4:05"), ["1:01", "4:05"]);
  assert.deepEqual(shell.splitTime("Live stream"), ["Live stream", ""]);
  assert.deepEqual(shell.splitTime(""), ["", ""]);
});

test("the bar's seek and volume sliders hand their value to the existing slider and fire its own event", () => {
  const events = [];
  const target = { value: "0", disabled: false, dispatchEvent: (event) => events.push([event.type, target.value]) };
  shell.forwardRange(target, 42, "input");
  shell.forwardRange(target, 57, "change");
  assert.deepEqual(events, [["input", "42"], ["change", "57"]]);
  target.disabled = true;
  shell.forwardRange(target, 99, "change");
  assert.equal(target.value, "57", "a disabled slider is left alone");
  assert.equal(events.length, 2);
});

test("the page loads the Modern stylesheet last and the Modern shell after every script it mirrors", () => {
  assert.match(html, /<link rel="stylesheet" href="\/waveformSeek\.css\?v=\d+">\n    <link rel="stylesheet" href="\/modern\.css\?v=[\w-]+">\n  <\/head>/);
  const at = (file) => html.indexOf(`src="/${file}`);
  assert.notEqual(at("modernShell.js"), -1);
  for (const file of ["app.js", "lyrion.js", "roonZoneBar.js", "volumeControl.js", "playerCard.js"]) assert.ok(at("modernShell.js") > at(file), `after ${file}`);
  assert.match(html, /<script src="\/modernShell\.js\?v=[\w-]+"><\/script>\n  <\/body>/);
});

function cssRules(text) {
  const rules = [];
  const body = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const stack = [];
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === "{") {
      const prelude = body.slice(start, i).trim();
      stack.push(prelude);
      if (!prelude.startsWith("@")) rules.push({ selector: prelude, media: stack.slice(0, -1).join(" "), at: i });
      start = i + 1;
    } else if (body[i] === "}") {
      const open = rules.findLast((r) => r.at < i && r.end === undefined);
      if (open && stack.at(-1) === open.selector) { open.end = i; open.block = body.slice(open.at + 1, i); }
      stack.pop();
      start = i + 1;
    }
  }
  return rules;
}

function splitSelectors(selector) {
  const parts = [];
  let depth = 0, from = 0;
  for (let i = 0; i < selector.length; i += 1) {
    if (selector[i] === "(") depth += 1;
    else if (selector[i] === ")") depth -= 1;
    else if (selector[i] === "," && depth === 0) { parts.push(selector.slice(from, i).trim()); from = i + 1; }
  }
  parts.push(selector.slice(from).trim());
  return parts;
}

test("every Modern rule is scoped under body.layoutModern, so Classic renders exactly as before", () => {
  const rules = cssRules(css);
  assert.ok(rules.length >= 20, `the Modern stylesheet has its rules (found ${rules.length})`);
  for (const rule of rules) {
    for (const part of splitSelectors(rule.selector)) assert.match(part, /^body\.layoutModern\b/, part);
  }
});

test("Modern hides the five stacked rows the rail and player bar replace", () => {
  const hidden = cssRules(css).filter((r) => /display:\s*none/.test(r.block) && !r.media).flatMap((r) => splitSelectors(r.selector));
  for (const row of [".playbackSystemBar", "#hqplayerLinks", "#roonZoneBar", "#lyrionPlayerBar", ".shell > .topbar", ".shell > .secondaryNav"]) {
    assert.ok(hidden.some((s) => s === `body.layoutModern ${row}`), `${row} is hidden in Modern`);
  }
});

test("Modern text is drawn only in theme colours, so every theme recolours it", () => {
  const declarations = [...css.matchAll(/(?:^|[;{\s])color:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(declarations.length > 5);
  for (const value of declarations) assert.match(value, /^(var\(--(text|muted|accent|bg)\)|inherit|currentColor)( !important)?$/, value);
});

test("rail, tab and player bar controls are at least 44px touch targets", () => {
  const rule = cssRules(css).find((r) => r.selector === "body.layoutModern :is(.modernRail, .modernTabs, .modernPlayerBar, .modernMenuPanel) :is(button, a)");
  assert.ok(rule, "one shared control rule");
  assert.match(rule.block, /min-height: 44px( !important)?;/);
  assert.match(rule.block, /min-width: 44px;/);
});

test("under 700px the rail becomes a bottom tab bar; above it the tab bar is not shown", () => {
  const rules = cssRules(css);
  const desktop = rules.find((r) => r.selector === "body.layoutModern .modernTabs" && !r.media);
  assert.ok(desktop, "desktop rule for the tab bar");
  assert.match(desktop.block, /display: none;/);
  const phone = rules.find((r) => r.selector === "body.layoutModern .modernTabs" && /max-width: 699px/.test(r.media));
  assert.ok(phone, "phone rule for the tab bar");
  assert.match(phone.block, /display: grid;/);
  assert.match(phone.block, /position: fixed;/);
});

test("the player bar puts the volume directly under the transport buttons, above the seek bar", () => {
  const transport = source.slice(source.indexOf('make("div", { className: "modernTransport" }'), source.indexOf('make("div", { className: "modernBarTools" }'));
  const order = ["modernTransportButtons", "volumeLabel", "modernSeekRow"].map((marker) => transport.indexOf(marker));
  assert.ok(order.every((at) => at > 0), `all three in the transport column: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.doesNotMatch(source.slice(source.indexOf('make("div", { className: "modernBarTools" }')), /volumeLabel\)/);
});
