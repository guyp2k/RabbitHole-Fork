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
    ["listen", "Listen", [["Now Playing", "player"], ["Queue", "queue"], ["Playlists", "playlists"], ["Library", "roonLibrary"]]],
    ["discover", "Discover", [["Rabbit Hole", "discover"], ["Standby", "standby"], ["Sonic Review", "sonicReview"], ["Beatport", "beatportCharts"], ["Radio", "radio"], ["TIDAL", "tidal"], ["TIDAL Library", "tidalLibrary"]]],
    ["you", "You", [["Music Memory", "musicMemory"], ["Taste", "history"], ["Synapse Memory", "memory"]]],
    ["system", "System", [["Connections", "connections"], ["AI", "ai"], ["Diagnostics", "diagnostics"], ["Database", "database"], ["Settings", "settings"]]]
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
      if (!prelude.startsWith("@") && !stack.some((entry) => entry.startsWith("@keyframes"))) rules.push({ selector: prelude, media: stack.slice(0, -1).join(" "), at: i });
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

test("Modern hides the five stacked rows the rail replaces", () => {
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

test("rail, tab and menu controls are at least 44px touch targets", () => {
  const rule = cssRules(css).find((r) => r.selector === "body.layoutModern :is(.modernRail, .modernTabs, .modernMenuPanel) :is(button, a)");
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

test("in Modern the page's own volume moves directly under the page's transport buttons, for Roon and Lyrion", () => {
  assert.deepEqual(shell.pageVolumeHomes(), [{ volume: "nowVolume", row: "#playerView .controls" }, { volume: "lyrionVolume", row: "#lyrionNow .lyrionActions" }]);
  assert.match(source, /for \(const home of pageVolumeHomes\(\)\)/);
  assert.match(source, /row\.append\(control\)/, "inside the transport row, so the view's grid cannot auto-place it elsewhere");
  assert.match(css, /body\.layoutModern :is\(#playerView \.controls, #lyrionNow \.lyrionActions\):has\(\.modernPageVolume\)\s*\{[^}]*flex-wrap: wrap;[^}]*justify-content: center;/);
  assert.match(css, /body\.layoutModern \.modernPageVolume\s*\{[^}]*grid-column: 1 \/ -1;[^}]*flex-basis: 100%;[^}]*justify-content: center;/, "its own full-width row under the buttons, in the grid and the flex layouts");
});

test("the moved page volume's minus and plus are round 44px buttons on Roon and Lyrion alike", () => {
  assert.match(css, /body\.layoutModern \.modernPageVolume \.volumeStep\s*\{[^}]*flex: 0 0 44px;[^}]*width: 44px;[^}]*height: 44px;[^}]*border-radius: 50% !important;/);
});

test("Modern has no bottom player bar: the page's own controls are the only transport", () => {
  assert.doesNotMatch(source, /modernPlayerBar/);
  assert.doesNotMatch(css, /modernPlayerBar/);
  assert.doesNotMatch(source, /modernTransport|modernSeek|modernVolume/);
});

test("Zone and Links live in the side rail, below the Roon and Lyrion switch", () => {
  assert.match(source, /const railTools = make\("div", \{ className: "modernRailTools" \}, zoneMenu, linksMenu\);/);
  assert.match(source, /rail\.append\(brand, railBody, systemSwitch, railTools\);/);
  assert.match(css, /body\.layoutModern \.modernSystemSwitch\s*\{[^}]*margin-top: auto;/, "the switch starts the bottom group");
  assert.doesNotMatch(css.slice(css.indexOf("body.layoutModern .modernRailTools {")).split("}")[0], /margin-top: auto/);
});

test("the rail's menus open beside the rail, so the rail's own overflow cannot clip them", () => {
  const panel = css.slice(css.indexOf("body.layoutModern .modernMenuPanel {"));
  assert.match(panel.slice(0, panel.indexOf("}")), /position: fixed;[^}]*left: calc\(var\(--modern-rail-width\) \+ 8px\);/);
});

test("a rail section shows its items when it is the current one or was expanded, unless it was collapsed", () => {
  const empty = { expanded: [], collapsed: [] };
  assert.equal(shell.sectionOpen("listen", { current: "listen", ...empty }), true);
  assert.equal(shell.sectionOpen("discover", { current: "listen", ...empty }), false);
  assert.equal(shell.sectionOpen("discover", { current: "listen", expanded: ["discover"], collapsed: [] }), true);
  assert.equal(shell.sectionOpen("listen", { current: "listen", expanded: [], collapsed: ["listen"] }), false);
});

test("clicking a rail heading expands or collapses that section in place and never navigates", () => {
  assert.deepEqual(shell.toggleSection("discover", { current: "listen", expanded: [], collapsed: [] }), { expanded: ["discover"], collapsed: [] });
  assert.deepEqual(shell.toggleSection("discover", { current: "listen", expanded: ["discover"], collapsed: [] }), { expanded: [], collapsed: ["discover"] });
  assert.deepEqual(shell.toggleSection("listen", { current: "listen", expanded: [], collapsed: [] }), { expanded: [], collapsed: ["listen"] });
  const heading = source.slice(source.indexOf("heading.addEventListener"), source.indexOf("\n", source.indexOf("heading.addEventListener")));
  assert.doesNotMatch(heading, /openSection|\.click\(\)/);
  assert.match(css, /body\.layoutModern \.modernRailSection:not\(\.isOpen\) \.modernRailItems\s*\{\s*display: none;/);
  assert.match(source, /className: "modernCaret", "aria-hidden": "true"/);
});

test("a hidden rail menu, such as Links with no links configured, takes no space", () => {
  assert.match(css, /body\.layoutModern \.modernMenu\[hidden\]\s*\{\s*display: none;/);
});

test("the rail's menu panels hang off the page, not the rail, so the rail's blur and overflow cannot clip them", () => {
  assert.match(source, /document\.body\.append\(rail, tabs, zonePanel, linksPanel\);/);
  assert.match(source, /const inside = \[zoneMenu, linksMenu, zonePanel, linksPanel\]\.some\(\(node\) => node\.contains\(event\.target\)\);/);
});

test("the transport row spans its whole column, so the moved volume wraps under the buttons at every window width", () => {
  assert.match(css, /body\.layoutModern :is\(#playerView \.controls, #lyrionNow \.lyrionActions\):has\(\.modernPageVolume\)\s*\{[^}]*width: 100%;/);
  assert.match(css, /body\.layoutModern \.modernPageVolume \.volumeReadout\s*\{[^}]*white-space: nowrap;/);
  assert.match(css, /body\.layoutModern \.modernPageVolume\s*\{[^}]*max-width: none;/, ".nowVolume's 380px cap would let it fit beside the buttons on a wide row");
  assert.match(css, /body\.layoutModern \.modernPageVolume \.volumeSlider\s*\{[^}]*flex: 0 1 260px;/, "the slider keeps a compact width on its own line");
});

test("Roon's right-hand groups get real Rating, Actions and Playlists headings that fold them", () => {
  assert.deepEqual(shell.roonPanelGroups(), [
    { key: "rating", label: "Rating", selector: "#nowDiscoveryTools > #nowFeedback" },
    { key: "actions", label: "Actions", selector: "#nowDiscoveryTools > .nowDiscoveryActions" },
    { key: "playlists", label: "Playlists", selector: "#nowDiscoveryTools > .nowTidalPlaylistGroup" },
    { key: "system", label: "System", selector: "#playerView .nowInfo > #pcTempOverlay" }
  ]);
  assert.match(css, /body\.layoutModern #nowDiscoveryTools > :is\(#nowFeedback, \.nowDiscoveryActions, \.nowTidalPlaylistGroup\)::before\s*\{\s*content: none !important;/);
});

test("Lyrion's right-hand sections fold from their own headings", () => {
  assert.match(source, /document\.querySelectorAll\("#lyrionDiscoveryRail > section > h3, /);
});

test("a folded panel group hides its content but keeps its heading, and the heading says whether it is open", () => {
  assert.match(css, /body\.layoutModern \.modernFolded\s*\{\s*display: none !important;/);
  assert.match(css, /body\.layoutModern section\.modernSectionFolded > :not\(h3\)\s*\{\s*display: none !important;/);
  assert.match(source, /"aria-expanded": String\(!folded\)/);
});

test("folded panel groups are remembered per browser, and a broken saved value counts as nothing folded", () => {
  assert.deepEqual(shell.readFolded('["roon:rating","lyrion:add to playlist"]'), ["roon:rating", "lyrion:add to playlist"]);
  assert.deepEqual(shell.readFolded("not json"), []);
  assert.deepEqual(shell.readFolded('{"a":1}'), []);
  assert.deepEqual(shell.readFolded(null), []);
});

test("the left column's Now Playing details fold from a Now Playing heading, on Roon and Lyrion", () => {
  assert.deepEqual(shell.nowDetailsGroups(), [
    { key: "roon:now playing", container: "#playerView .nowInfo", keep: "#pcTempOverlay" },
    { key: "lyrion:now playing", container: "#lyrionNow .lyrionNowDetails", keep: "#lyrionSystem" }
  ]);
  assert.match(css, /body\.layoutModern \.modernNowFolded > :not\(\.modernPanelHeading\):not\(#pcTempOverlay\):not\(#lyrionSystem\)\s*\{\s*display: none !important;/);
  assert.match(css, /body\.layoutModern :is\(#playerView \.nowInfo, #lyrionNow \.lyrionNowDetails\) > \.eyebrow\s*\{\s*display: none !important;/, "the heading replaces the eyebrow");
});

test("the left column's System block folds from a System heading, on Roon and Lyrion", () => {
  assert.deepEqual(shell.roonPanelGroups().find((group) => group.key === "system"), { key: "system", label: "System", selector: "#playerView .nowInfo > #pcTempOverlay" });
  assert.match(css, /body\.layoutModern #pcTempOverlay::before\s*\{\s*content: none !important;/);
  assert.match(source, /document\.querySelectorAll\("#lyrionDiscoveryRail > section > h3, #lyrionSystem > h3"\)/);
});

test("fold headings stand out from the page with a theme-coloured gradient and an accent edge", () => {
  const rule = css.slice(css.indexOf("body.layoutModern .modernFoldButton {")).split("}")[0];
  assert.match(rule, /background: linear-gradient\(90deg, color-mix\(in srgb, var\(--accent\) 24%, transparent\), color-mix\(in srgb, var\(--accent\) 6%, transparent\)\) !important;/);
  assert.match(rule, /border-left: 3px solid var\(--accent\) !important;/);
  assert.match(rule, /color: var\(--text\) !important;/);
});

test("the right-hand discovery column has no framed outline in Modern so it matches the left column", () => {
  const rule = css.slice(css.indexOf("body.layoutModern #nowDiscoveryTools {")).split("}")[0];
  assert.match(rule, /border: 0 !important;/);
  assert.match(rule, /background: transparent !important;/);
  assert.match(rule, /box-shadow: none !important;/);
});

test("the Lyrion right-hand rail drops its divider line in Modern", () => {
  const rule = css.slice(css.indexOf("body.layoutModern #lyrionDiscoveryRail {")).split("}")[0];
  assert.match(rule, /border-left: 0 !important;/);
});

test("the Lyrion System pill spans the full column like Now Playing", () => {
  const rule = css.slice(css.indexOf("body.layoutModern #lyrionSystem {")).split("}")[0];
  assert.match(rule, /grid-template-columns: max-content minmax\(0, 1fr\);/);
});

const pixels = (...runs) => runs.flatMap(([count, rgba]) => Array.from({ length: count }, () => rgba)).flat();

test("the ambient palette leads with the dominant colour of the cover", () => {
  const palette = shell.ambientPalette(pixels([60, [200, 40, 40, 255]], [40, [120, 120, 120, 255]]));
  assert.equal(palette[0], "rgb(200, 40, 40)");
});

test("the ambient palette takes a clearly different second colour when the cover has one", () => {
  const palette = shell.ambientPalette(pixels([60, [200, 40, 40, 255]], [3, [205, 45, 42, 255]], [30, [30, 60, 200, 255]]));
  assert.deepEqual(palette, ["rgb(200, 40, 40)", "rgb(30, 60, 200)"]);
});

test("the ambient palette favours colour over grey of similar area", () => {
  const palette = shell.ambientPalette(pixels([50, [128, 128, 128, 255]], [40, [40, 170, 90, 255]]));
  assert.equal(palette[0], "rgb(40, 170, 90)");
});

test("the ambient palette lifts very dark colours so the tint stays visible", () => {
  assert.deepEqual(shell.ambientPalette(pixels([10, [0, 0, 40, 255]])), ["rgb(0, 0, 140)", "rgb(0, 0, 140)"]);
});

test("the ambient palette is unknown when the cover has no opaque pixels", () => {
  assert.equal(shell.ambientPalette(pixels([10, [255, 0, 0, 0]])), null);
  assert.equal(shell.ambientPalette([]), null);
});

test("the artwork address is read from a CSS url value and is unknown when empty", () => {
  assert.equal(shell.artworkFromCss('url("/api/image/abc?x=1")'), "/api/image/abc?x=1");
  assert.equal(shell.artworkFromCss(""), null);
  assert.equal(shell.artworkFromCss("none"), null);
});

test("the ambient backdrop sits behind the page, fades between covers and holds still for reduced motion", () => {
  assert.match(css, /@property --ambient-1 \{ syntax: "<color>"; inherits: true; initial-value: transparent; \}/);
  const layer = css.slice(css.indexOf("body.layoutModern .modernAmbient {")).split("}")[0];
  assert.match(layer, /position: fixed;/);
  assert.match(layer, /z-index: 1;/);
  assert.match(layer, /pointer-events: none;/);
  assert.match(layer, /transition: --ambient-1 1\.6s ease, --ambient-2 1\.6s ease;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*body\.layoutModern \.modernAmbient \{ transition: none; \}/);
});

test("the ambient colours follow the Roon artwork backdrop and the Lyrion cover", () => {
  assert.match(source, /getPropertyValue\("--now-artwork-backdrop"\)/);
  assert.match(source, /\$\("lyrionCover"\)/);
  assert.match(source, /documentElement\.style\.setProperty\("--ambient-1"/);
  assert.match(source, /document\.body\.prepend\(make\("div", \{ className: "modernAmbient", "aria-hidden": "true" \}\)\)/);
});

test("the Now Playing side columns run the full player height so their panels are not cut off at the cover", () => {
  const selector = "body.layoutModern #playerView .player.player--regular:not(.isMaximized):not(.isFullWindow) > :is(.now, .nowDiscoveryTools) {";
  assert.ok(css.includes(selector), "the side-column rule exists");
  const rule = css.slice(css.indexOf(selector)).split("}")[0];
  assert.match(rule, /grid-row: 2 \/ -1;/);
  assert.match(rule, /align-self: stretch;/);
  assert.match(rule, /height: auto;/);
  assert.match(rule, /contain: size;/);
  assert.match(rule, /overflow-y: auto;/);
});

test("a track change animates only when a shown value is replaced by a different one", () => {
  assert.equal(shell.trackChanged(null, "Birds"), false);
  assert.equal(shell.trackChanged("Birds", "Birds"), false);
  assert.equal(shell.trackChanged("Birds", "Fever"), true);
  assert.equal(shell.trackChanged("Birds", ""), false);
});

test("Modern motion runs only when the viewer has not asked for reduced motion", () => {
  const motion = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference) {"));
  assert.ok(css.includes("@media (prefers-reduced-motion: no-preference) {"), "motion is gated");
  assert.match(motion, /body\.layoutModern \.modernReveal \{ animation: modernReveal 0\.28s ease-out both; \}/);
  assert.match(motion, /body\.layoutModern \.modernTrackIn \{ animation: modernTrackIn 0\.6s ease-out both; \}/);
  assert.match(css, /@keyframes modernReveal \{ from \{ opacity: 0; transform: translateY\(-6px\); \} \}/);
  assert.match(css, /@keyframes modernTrackIn \{ from \{ opacity: 0\.35; transform: scale\(0\.985\); \} \}/);
});

test("folds animate the panel they open, and only on a click that opens it", () => {
  assert.match(source, /const shown = apply\(fold\);\s*if \(!fold\) replay\(shown, "modernReveal"\);/);
});

test("the cover, title and artist animate when the Roon or Lyrion track changes", () => {
  for (const id of ["cover", "nowTitle", "nowSubtitle", "lyrionCover", "lyrionTitle", "lyrionArtist"]) {
    assert.match(source, new RegExp(`\\["${id}", `), `${id} is watched`);
  }
  assert.match(source, /replay\(\[node\], "modernTrackIn"\)/);
});

const HQP = { state: 2, mode: "SDM (DSD)", rate: 22579200, bits: 1, filter: "poly-sinc-ext2-xla", shaper: "ASDM7ECv3", source: { rate: 96000, bits: 24 } };

test("the signal chain runs source, Roon, HQPlayer and output from the HQPlayer reading", () => {
  assert.deepEqual(shell.signalChain({ transport: "Roon", zoneName: "HQPd", state: "playing", hqplayer: HQP, output: "DSD512 · 22.5792 MHz / 1-bit SDM" }), [
    { label: "Source", value: "96 kHz / 24-bit" },
    { label: "Roon", value: "HQPd · playing" },
    { label: "HQPlayer", value: "poly-sinc-ext2-xla · ASDM7ECv3" },
    { label: "Output", value: "DSD512 · 22.5792 MHz / 1-bit SDM" }
  ]);
});

test("the signal chain formats CD and DSD sources and leaves out a source HQPlayer did not report", () => {
  const source = (src) => shell.signalChain({ transport: "Roon", zoneName: "HQPd", state: "playing", hqplayer: { ...HQP, source: src }, output: "x" })[0];
  assert.deepEqual(source({ rate: 44100, bits: 16 }), { label: "Source", value: "44.1 kHz / 16-bit" });
  assert.deepEqual(source({ rate: 2822400, bits: 1 }), { label: "Source", value: "2.8224 MHz / 1-bit" });
  assert.deepEqual(source(undefined), { label: "Roon", value: "HQPd · playing" });
});

test("there is no signal chain without a zone or an HQPlayer output", () => {
  assert.equal(shell.signalChain({ transport: "Roon", zoneName: "", state: "stopped", hqplayer: HQP, output: "x" }), null);
  assert.equal(shell.signalChain({ transport: "Roon", zoneName: "Den", state: "playing", hqplayer: null, output: "" }), null);
  assert.equal(shell.signalChain({ transport: "Roon", zoneName: "Den", state: "playing", hqplayer: { ...HQP, rate: 0 }, output: "" }), null);
});

test("the signal chain strip sits below the seek bar across the player and its pills keep their text inside", () => {
  const strip = css.slice(css.indexOf("body.layoutModern .modernSignalChain {")).split("}")[0];
  assert.match(strip, /grid-column: 1 \/ -1;/);
  const pills = css.slice(css.indexOf("body.layoutModern .modernChainStages {")).split("}")[0];
  assert.match(pills, /flex-wrap: wrap;/);
  const value = css.slice(css.indexOf("body.layoutModern .modernChainStage span {")).split("}")[0];
  assert.match(value, /white-space: normal;/);
  assert.match(value, /overflow-wrap: anywhere;/);
  const stage = css.slice(css.indexOf("body.layoutModern .modernChainStage {")).split("}")[0];
  assert.match(stage, /min-width: 0;/);
  assert.match(stage, /max-width: 100%;/);
  assert.match(css, /body\.layoutModern :is\(#nowPlaybackSignal, #nowPlayback \.hqpHostLine\) \{\s*display: none !important;/);
});

test("the strip follows roon-signal and draws the host health with its warning levels", () => {
  assert.match(source, /output: hqplayerRows\(detail\.hqplayer\)\[0\]\?\.\[1\] \|\| ""/);
  assert.match(source, /hqpHostParts\(detail\.hqplayer\)/);
  assert.match(source, /if \(part\.level\) span\.dataset\.level = part\.level;/);
});

test("the cover is sized from the measured playback strip height so no gap is left under the rating", () => {
  assert.match(source, /new ResizeObserver\(\(\) => artStack\.style\.setProperty\("--modern-strip-height", `\$\{playback\.offsetHeight\}px`\)\)\.observe\(playback\)/);
  const rule = css.slice(css.indexOf("body.layoutModern #playerView .player > .artStack > .cover:has(+ #nowPlayback:not([hidden])) {")).split("}")[0];
  assert.match(rule, /width: min\(100cqw, calc\(100cqh - var\(--modern-strip-height, 52px\) - 8px\)\) !important;/);
});

test("the centre format line reads the format and where it came from, and is empty when nothing matched", () => {
  assert.equal(shell.formatLine({ text: "44.1 kHz / 16-bit", note: "Library file" }), "44.1 kHz / 16-bit · Library file");
  assert.equal(shell.formatLine({ text: "FLAC 96 kHz / 24-bit", note: "" }), "FLAC 96 kHz / 24-bit");
  assert.equal(shell.formatLine({ text: "", note: "TIDAL catalogue" }), "");
  assert.equal(shell.formatLine(null), "");
});

test("the app shares every Now Playing format change, including the reset, as a roon-format event", () => {
  const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  assert.match(app, /function shareNowFormat\(\) \{\s*document\.querySelector\("#playerView \.player"\)\?\.dispatchEvent\(new CustomEvent\("roon-format", \{ detail: \{ text: state\.nowFormat\.text, note: NOW_FORMAT_NOTES\[state\.nowFormat\.from\] \|\| "" \} \}\)\);\s*\}/);
  assert.match(app, /state\.nowFormat = \{ key, text: "", from: "" \};\s*shareNowFormat\(\);/);
  assert.match(app, /state\.nowFormat = \{ key, text: result\.format, from: result\.from \|\| "" \};\s*shareNowFormat\(\);/);
});

test("Modern puts the format line under the playback status and hides it when empty", () => {
  assert.match(source, /\$\("nowPlaybackChain"\)\?\.after\(formatLineNode\)/);
  assert.match(source, /const showFormat = \(node, detail\) => \{\s*node\.textContent = formatLine\(detail\);\s*node\.hidden = !node\.textContent;\s*\};/);
  assert.match(source, /addEventListener\("roon-format", \(\{ detail \}\) => showFormat\(formatLineNode, detail\)\)/);
  const rule = css.slice(css.indexOf("body.layoutModern .modernFormatLine {")).split("}")[0];
  assert.match(rule, /color: var\(--muted\);/);
  assert.match(rule, /text-align: center;/);
});

test("the cover area shrinks by exactly the overflow so the whole player fits the window, within its floor and cap", () => {
  const fit = (over) => shell.fitStageHeight({ stage: 638, playerBottom: 1101, trailing: 24, viewport: 1064, min: 320, max: 660, ...over });
  assert.equal(fit(), 577);
  assert.equal(fit({ stage: 460, playerBottom: 923, viewport: 860 }), 373);
  assert.equal(fit({ stage: 660, playerBottom: 1123, viewport: 1400 }), 660);
  assert.equal(fit({ viewport: 600 }), 320);
  assert.equal(fit({ stage: Number.NaN }), null);
});

test("Modern refits the cover area on resize and only in the regular player", () => {
  assert.match(source, /player\.style\.setProperty\("--rh-regular-stage-height", `\$\{next\}px`\)/);
  assert.match(source, /player\.style\.removeProperty\("--rh-regular-stage-height"\)/);
  assert.match(source, /addEventListener\("resize", fitStage\)/);
  assert.match(source, /trailing: shellNode\.getBoundingClientRect\(\)\.bottom - box\.bottom/);
});

test("the signal chain names the transport, so Lyrion zones read Lyrion rather than Roon", () => {
  const stages = shell.signalChain({ transport: "Lyrion", zoneName: "HQPlayer (HQPlayerEmbedded)", state: "play", hqplayer: HQP, output: "DSD512 · 22.5792 MHz / 1-bit SDM" });
  assert.deepEqual(stages[1], { label: "Lyrion", value: "HQPlayer (HQPlayerEmbedded) · play" });
});

test("Lyrion shares its HQPlayer reading and its format as events for the Modern strip and format line", () => {
  const lyrion = fs.readFileSync(require.resolve("../public/lyrion.js"), "utf8");
  assert.match(lyrion, /\$\("lyrionNow"\)\.dispatchEvent\(new CustomEvent\("lyrion-signal", \{ detail: \{ zoneName: status\?\.playerName \|\| "", state: status\?\.connected \? status\.state : "", hqplayer: h \|\| null \} \}\)\);/);
  assert.match(lyrion, /renderHqplayer\(s\.hqplayer, s\);/);
  assert.match(lyrion, /\$\("lyrionNow"\)\.dispatchEvent\(new CustomEvent\("lyrion-format", \{ detail: \{ text: format\?\.\[1\] \|\| "", note: format\?\.\[2\] \|\| "" \} \}\)\);/);
});

test("Modern draws the Lyrion format line and signal chain from those events and hides Lyrion's old HQPlayer lines", () => {
  assert.match(source, /\$\("lyrionChain"\)\?\.after\(lyrionFormatNode\)/);
  assert.match(source, /addEventListener\("lyrion-format", \(\{ detail \}\) => showFormat\(lyrionFormatNode, detail\)\)/);
  assert.match(source, /addEventListener\("roon-signal", \(\{ detail \}\) => renderSignalChain\(chainStrip, detail, "Roon"\)\)/);
  assert.match(css, /body\.layoutModern :is\(#lyrionHqplayer, #lyrionPlayback > \.hqpHostLine\) \{\s*display: none !important;/);
});

test("Lyrion's chain uses the HQPlayer reading only while that Lyrion player is playing, since HQPlayer may be playing Roon", () => {
  const detail = (state) => ({ zoneName: "HQPlayer (HQPlayerEmbedded)", state, hqplayer: HQP });
  assert.deepEqual(shell.lyrionChainDetail(detail("playing")), detail("playing"));
  for (const state of ["stopped", "paused", ""]) assert.deepEqual(shell.lyrionChainDetail(detail(state)), { ...detail(state), hqplayer: null }, state);
  assert.match(source, /addEventListener\("lyrion-signal", \(\{ detail \}\) => renderSignalChain\(lyrionChainStrip, lyrionChainDetail\(detail\), "Lyrion"\)\)/);
});

test("a connector between pills that wrap onto different rows is hidden instead of dangling at a row end", () => {
  assert.match(source, /wire\.style\.visibility = next\.getBoundingClientRect\(\)\.top >= previous\.getBoundingClientRect\(\)\.bottom \? "hidden" : "";/);
  assert.match(source, /for \(const strip of \[chainStrip, lyrionChainStrip\]\) new ResizeObserver\(\(\) => tidyWires\(strip\)\)\.observe\(strip\);/);
  assert.match(source, /strip\.replaceChildren\(pills, host\);\s*strip\.hidden = false;\s*tidyWires\(strip\);/);
});

test("the full-height side columns apply only to the desktop three-column player, never to the one-column phone layout", () => {
  const selector = "body.layoutModern #playerView .player.player--regular:not(.isMaximized):not(.isFullWindow) > :is(.now, .nowDiscoveryTools)";
  const rules = cssRules(css).filter((rule) => rule.selector === selector);
  assert.equal(rules.length, 1, "one side-column rule");
  assert.equal(rules[0].media, "@media (min-width: 1100px)");
});

const phoneRule = (selector) => {
  const rules = cssRules(css).filter((r) => r.selector === selector && r.media.includes("@media (max-width: 699px)"));
  assert.ok(rules.length, `${selector} has a phone rule`);
  return rules.map((r) => r.block).join("\n");
};

test("on phones the top bar keeps Roon|Lyrion, Zone and Links on the first row and scrolls the page chips on a second row", () => {
  assert.match(phoneRule("body.layoutModern .modernRail"), /flex-wrap: wrap;/);
  assert.match(phoneRule("body.layoutModern .modernSystemSwitch"), /order: -2;/);
  const tools = phoneRule("body.layoutModern .modernRailTools");
  assert.match(tools, /order: -1;/);
  assert.match(tools, /flex-direction: row;/);
  const sections = phoneRule("body.layoutModern .modernRailSections");
  assert.match(sections, /flex: 1 0 100%;/);
  assert.match(sections, /overflow-x: auto;/);
});

const narrowRule = (selector) => {
  const rules = cssRules(css).filter((r) => r.selector === selector && r.media.includes("@media (max-width: 1099px)"));
  assert.ok(rules.length, `${selector} has a narrow-player rule`);
  return rules.map((r) => r.block).join("\n");
};

test("on phones the Roon player runs title, cover, up next, transport, seek, signal chain, then the rating and playlist panels", () => {
  assert.match(narrowRule("body.layoutModern #playerView .player:is(.player--regular, .player--maximized, .player--fullscreen)"), /grid-template-areas: "viewControls" "now" "art" "upnext" "controls" "seek" "chain" "tools" !important;/);
  assert.match(narrowRule("body.layoutModern #playerView .player > .nowUpNext"), /grid-area: upnext !important;/);
  assert.match(narrowRule("body.layoutModern #playerView .player > .modernSignalChain"), /grid-area: chain !important;/);
  assert.match(narrowRule("body.layoutModern #playerView .player > .artStack"), /height: calc\(min\(100vw - var\(--modern-rail-width\) - 2 \* var\(--modern-gutter\) - 64px, 440px\) \+ var\(--modern-strip-height, 70px\) \+ 8px\);/);
});

test("on phones the transport is one row of 48px buttons, the duplicate play-state line is gone, and fold headings sit above their panels", () => {
  assert.match(narrowRule("body.layoutModern #playerView .player > .controls"), /display: flex !important;/);
  assert.match(narrowRule("body.layoutModern #playerView .player > .controls > .transportButton"), /min-width: 48px;\s*min-height: 48px;/);
  assert.match(narrowRule("body.layoutModern #playerView .seekBlock :is(.playerMeta, #playState, #queueInfo)"), /display: none !important;/);
  const tools = narrowRule("body.layoutModern #nowDiscoveryTools");
  assert.match(tools, /display: flex !important;/);
  assert.match(tools, /flex-direction: column;/);
});

test("the playback status under the cover is drawn above the blurred art and vignette so it stays legible", () => {
  const rule = css.slice(css.indexOf("body.layoutModern #playerView .artStack > #nowPlayback {")).split("}")[0];
  assert.match(rule, /position: relative;/);
  assert.match(rule, /z-index: 2;/);
});

test("on phones each playlist checkbox sits in a 44px-wide tap column of its label", () => {
  assert.match(phoneRule("body.layoutModern #playerView .player #nowDiscoveryTools .nowTidalPlaylistTarget"), /grid-template-columns: 44px minmax\(0, 1fr\);/);
  const box = phoneRule("body.layoutModern #nowDiscoveryTools .nowTidalPlaylistTarget > input[type=\"checkbox\"]");
  assert.match(box, /width: 24px;\s*height: 24px;\s*min-height: 24px;\s*margin: 0;\s*justify-self: center;/);
});

test("the one-column player also covers the 700 to 1099px range where the side rail leaves too little width for three columns", () => {
  assert.match(narrowRule("body.layoutModern #playerView .player:is(.player--regular, .player--maximized, .player--fullscreen)"), /grid-template-columns: minmax\(0, 1fr\) !important;/);
  for (const [child, area] of [[".playerViewControls", "viewControls"], [".now", "now"], [".artStack", "art"], [".controls", "controls"], [".seekBlock", "seek"], ["#nowDiscoveryTools", "tools"]]) {
    assert.match(narrowRule(`body.layoutModern #playerView .player:is(.player--regular, .player--maximized, .player--fullscreen) > ${child}`), new RegExp(`grid-area: ${area} !important;`), child);
  }
  const player = narrowRule("body.layoutModern #playerView .player.player--regular:not(.isMaximized):not(.isFullWindow)");
  assert.match(player, /height: auto !important;\s*max-height: none !important;\s*overflow: visible !important;/);
  assert.match(narrowRule("body.layoutModern #playerView .player:is(.player--regular, .player--maximized, .player--fullscreen) > :is(.now, .seekBlock, #nowDiscoveryTools)"), /height: auto !important;\s*max-height: none !important;/);
  const phoneOnlyPlayer = cssRules(css).filter((r) => r.media.includes("@media (max-width: 699px)") && /#playerView \.player(\.player--regular:not\(\.isMaximized\):not\(\.isFullWindow\))?( >|$)/.test(r.selector));
  assert.deepEqual(phoneOnlyPlayer.map((r) => r.selector), []);
});

test("under 1100px the signal chain is one aligned stack of equal-width rows, label left and value right, without connectors", () => {
  const rule = (selector) => {
    const rules = cssRules(css).filter((r) => r.selector === selector && r.media.includes("@media (max-width: 1099px)"));
    assert.ok(rules.length, `${selector} has a narrow rule`);
    return rules.map((r) => r.block).join("\n");
  };
  const stages = rule("body.layoutModern .modernChainStages");
  assert.match(stages, /display: grid;/);
  assert.match(stages, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(stages, /width: min\(100%, 440px\);/);
  const stage = rule("body.layoutModern .modernChainStage");
  assert.match(stage, /flex-direction: row;/);
  assert.match(stage, /justify-content: space-between;/);
  assert.match(rule("body.layoutModern .modernChainStage span"), /text-align: right;/);
  assert.match(rule("body.layoutModern .modernChainWire"), /display: none;/);
});

test("the Now Playing extras are off unless the browser saved them on, and junk is ignored", () => {
  assert.deepEqual(shell.readExtras(null), { upNext: false, spectrum: false });
  assert.deepEqual(shell.readExtras("not json"), { upNext: false, spectrum: false });
  assert.deepEqual(shell.readExtras('{"upNext":true,"spectrum":"yes"}'), { upNext: true, spectrum: false });
  assert.deepEqual(shell.readExtras('{"upNext":true,"spectrum":true,"other":1}'), { upNext: true, spectrum: true });
});

test("each up-next cover names the track and its first artist, and covers without a queue id are left out", () => {
  assert.deepEqual(shell.upNextCards([
    { id: "11", title: "Layla", subtitle: "Derek and the Dominos - Layla And Other Assorted Love Songs", imageKey: "abc" },
    { id: "", title: "No id", subtitle: "Someone", imageKey: "x" },
    { id: "12", title: "Tumbling Dice", subtitle: "The Rolling Stones", imageKey: "" }
  ]), [
    { id: "11", title: "Layla", artist: "Derek and the Dominos", image: "/api/roon/image/abc?width=80&height=80" },
    { id: "12", title: "Tumbling Dice", artist: "The Rolling Stones", image: "" }
  ]);
});

test("the app shares the next five queue items and the queue summary as a roon-queue event", () => {
  const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  assert.match(app, /function shareQueue\(zone\) \{/);
  assert.match(app, /new CustomEvent\("roon-queue", \{ detail: \{ info: queued \? formatQueueInfo\(zone\) : "", items: queued \? displayQueueItems\(zone\)\.slice\(0, 5\)/);
  assert.match(app, /liveQueue\.innerHTML = "";\n  \}\n  shareQueue\(zone\);/);
});

test("Modern adds Up next and Spectrum toggles before Maximize Player, and covers reuse the queue's Play from here menu", () => {
  assert.match(source, /for \(const \[key, label, tip\] of \[\["upNext", "Up next", "Show the next covers in the queue"\], \["spectrum", "Spectrum", "Decorative: moves with playback, not live audio levels"\]\]\)/);
  assert.match(source, /for \(const home of \[\$\("togglePlayerMax"\), \$\("lyrionFullscreen"\)\]\)[\s\S]*?home\.before\(toggle\);/);
  assert.match(source, /localStorage\.setItem\(EXTRAS_KEY, JSON\.stringify\(extras\)\)/);
  assert.match(source, /className: "queueItemButton modernUpNextCard", "data-queue-item-id": card\.id, "aria-haspopup": "menu", "aria-controls": "queueActionMenu"/);
  assert.match(source, /make\("strong", \{ className: "queueItemTitle", text: card\.title \}\)/);
  assert.match(source, /const queueMenu = \$\("queueActionMenu"\);\s*if \(queueMenu\) document\.body\.append\(queueMenu\);/);
});

const narrowOrPhone = (selector) => {
  const rules = cssRules(css).filter((r) => r.selector === selector && r.media.includes("@media (max-width: 699px)"));
  assert.ok(rules.length, `${selector} has a phone rule`);
  return rules.map((r) => r.block).join("\n");
};

test("the extras show only when switched on, the spectrum animates only while playing and with motion allowed, and the phone toolbar wraps", () => {
  assert.match(css, /body\.layoutModern:not\(\.modernUpNextOn\) \.modernUpNextStrip,\s*body\.layoutModern:not\(\.modernSpectrumOn\) \.modernSpectrum \{\s*display: none !important;/);
  assert.match(css, /body\.layoutModern\.modernUpNextOn #playerView \.player:has\(\.modernUpNextStrip:not\(\[hidden\]\)\) > \.nowUpNext \{\s*display: none !important;/);
  const motion = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: no-preference) {"));
  assert.match(motion, /body\.layoutModern \.modernSpectrum\.isPlaying i \{ animation: modernSpectrum/);
  assert.match(narrowOrPhone("body.layoutModern #playerView .playerViewControls"), /flex-wrap: wrap;/);
});

test("under 1100px the maximized player also gets the one-column layout but keeps its own full-screen box", () => {
  assert.match(narrowRule("body.layoutModern #playerView .player:is(.player--regular, .player--maximized, .player--fullscreen)"), /grid-auto-rows: max-content !important;/);
  assert.match(narrowRule("body.layoutModern #playerView .player:is(.player--regular, .player--maximized, .player--fullscreen) > :is(.now, .seekBlock, #nowDiscoveryTools)"), /min-height: min-content !important;/);
  const both = "body.layoutModern #playerView .player:is(.player--regular, .player--maximized, .player--fullscreen)";
  assert.match(narrowRule(both), /grid-template-areas: "viewControls" "now" "art" "upnext" "controls" "seek" "chain" "tools" !important;/);
  const released = cssRules(css).filter((r) => r.media.includes("@media (max-width: 1099px)") && /overflow: visible !important;/.test(r.block));
  assert.deepEqual(released.map((r) => r.selector), ["body.layoutModern #playerView .player.player--regular:not(.isMaximized):not(.isFullWindow)"]);
});

test("on phones the player toolbar buttons wrap their labels inside the button instead of spilling out", () => {
  const rule = phoneRule("body.layoutModern #playerView .playerViewControls button");
  assert.match(rule, /white-space: normal;/);
  assert.match(rule, /min-width: 0;/);
  assert.match(rule, /flex: 1 1 0;/);
});

test("maximized and Full Window keep the transport as one centred row of round buttons, without the split corner layout or duplicate queue text", () => {
  const rule = (selector) => {
    const rules = cssRules(css).filter((r) => r.selector === selector && !r.media);
    assert.ok(rules.length, `${selector} has a rule`);
    return rules.map((r) => r.block).join("\n");
  };
  const controls = rule("body.layoutModern #playerView .player:is(.isMaximized, .isFullWindow) > .controls");
  assert.match(controls, /display: flex !important;/);
  assert.match(controls, /justify-content: center;/);
  assert.match(controls, /transform: none !important;/);
  assert.match(rule("body.layoutModern #playerView .player:is(.isMaximized, .isFullWindow) > .artStack"), /transform: none !important;/);
  const button = rule("body.layoutModern #playerView .player:is(.isMaximized, .isFullWindow) > .controls > .transportButton");
  assert.match(button, /width: 52px !important;/);
  assert.match(button, /border-radius: 50% !important;/);
  assert.match(button, /display: grid !important;/);
  assert.match(button, /place-items: center;/);
  assert.match(rule("body.layoutModern #playerView .player:is(.isMaximized, .isFullWindow) > .controls > .nowVolume"), /flex: 1 0 100%;/);
  assert.match(rule("body.layoutModern #playerView .player:is(.isMaximized, .isFullWindow) .seekBlock :is(.playerMeta, #playState, #queueInfo)"), /display: none !important;/);
});

test("on desktop, maximized and Full Window size the controls row to its content so the volume never overlaps the seek bar", () => {
  const wide = (selector) => {
    const rules = cssRules(css).filter((r) => r.selector === selector && r.media.includes("@media (min-width: 1100px)"));
    assert.ok(rules.length, `${selector} has a desktop rule`);
    return rules.map((r) => r.block).join("\n");
  };
  assert.match(wide("body.layoutModern #playerView .player.player--maximized.isMaximized:not(.isFullWindow)"), /grid-template-rows: 46px minmax\(0, 1fr\) 14px auto 46px !important;/);
  assert.match(wide("body.layoutModern #playerView .player.isFullWindow"), /grid-template-rows: 46px minmax\(0, 1fr\) 12px auto 46px !important;/);
});

test("the Lyrion rail section folds from its heading like Listen, Discover, You and System, open while you are in it", () => {
  assert.doesNotMatch(source, /make\("span", \{ className: "modernRailHeading"/);
  assert.doesNotMatch(source, /id === "lyrion" \|\| sectionOpen/);
  assert.match(source, /const open = sectionOpen\(id, \{ \.\.\.railState, current: currentSection \}\);/);
  assert.match(source, /const heading = make\("button", \{ type: "button", className: "modernRailHeading", "aria-expanded": "false", "aria-controls": listId \}/);
  assert.equal(shell.sectionOpen("lyrion", { current: "lyrion", expanded: [], collapsed: [] }), true);
  assert.deepEqual(shell.toggleSection("lyrion", { current: "lyrion", expanded: [], collapsed: [] }), { expanded: [], collapsed: ["lyrion"] });
});

const lyrionSource = fs.readFileSync(require.resolve("../public/lyrion.js"), "utf8");

test("Lyrion's Up next cards are the next five tracks after the one playing, with Lyrion's own artwork", () => {
  const queue = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => ({ index, title: `T${index}`, artist: `A${index}`, album: "X", artwork: index === 4 ? "" : `/api/lyrion/artwork?u=${index}` }));
  assert.deepEqual(shell.lyrionUpNextCards(queue, 2), [
    { index: 3, title: "T3", artist: "A3", image: "/api/lyrion/artwork?u=3" },
    { index: 4, title: "T4", artist: "A4", image: "" },
    { index: 5, title: "T5", artist: "A5", image: "/api/lyrion/artwork?u=5" },
    { index: 6, title: "T6", artist: "A6", image: "/api/lyrion/artwork?u=6" },
    { index: 7, title: "T7", artist: "A7", image: "/api/lyrion/artwork?u=7" }
  ]);
  assert.deepEqual(shell.lyrionUpNextCards(queue, 8), []);
  assert.deepEqual(shell.lyrionUpNextCards(undefined, 0), []);
  assert.equal(shell.lyrionUpNextInfo(9, 2), "6 remaining");
  assert.equal(shell.lyrionUpNextInfo(3, 2), "");
});

test("Lyrion shares its queue with the Modern shell, and each queue row can be found by its position", () => {
  assert.match(lyrionSource, /stage\.dispatchEvent\(new CustomEvent\('lyrion-queue',\{detail:\{items:s\.queue,index:s\.queueIndex,count:s\.queueCount\}\}\)\);/);
  assert.match(lyrionSource, /b\.dataset\.queueIndex=String\(t\.index\);/);
});

test("Lyrion Now Playing gets the same Up next and Spectrum toggles as Roon, sharing one saved setting", () => {
  assert.match(source, /for \(const home of \[\$\("togglePlayerMax"\), \$\("lyrionFullscreen"\)\]\)/);
  assert.match(source, /for \(const other of extraToggles\) if \(other\.dataset\.extra === key\) other\.setAttribute\("aria-pressed", String\(extras\[key\]\)\);/);
  assert.match(source, /\$\("lyrionNow"\)\?\.addEventListener\("lyrion-playback", \(\{ detail \}\) => lyrionSpectrum\.classList\.toggle\("isPlaying", detail\.state === "playing"\)\);/);
  assert.match(source, /\$\("lyrionNow"\)\?\.addEventListener\("lyrion-queue", \(\{ detail \}\) =>/);
  assert.match(source, /\$\("lyrionQueue"\)\?\.querySelector\(`\[data-queue-index="\$\{card\.index\}"\]`\)\?\.click\(\)/);
  assert.match(css, /body\.layoutModern\.modernUpNextOn #lyrionNow:has\(\.modernUpNextStrip:not\(\[hidden\]\)\) #lyrionStageQueue \{\s*display: none !important;/);
});

test("Lyrion's Up next row scrolls inside the cover column instead of widening it past a phone screen", () => {
  assert.match(css, /body\.layoutModern #lyrionNow :is\(\.lyrionArtworkLane, #lyrionPlayback, \.modernUpNextStrip\) \{\s*min-width: 0;\s*max-width: 100%;/);
  assert.match(css, /body\.layoutModern \.modernUpNextList \{[^}]*overflow-x: auto;/);
});

test("live radio shares no Up next covers, because the tracks queued behind a stream that never ends will not play", () => {
  const app = fs.readFileSync(require.resolve("../public/app.js"), "utf8");
  const body = app.slice(app.indexOf("function shareQueue(zone) {"), app.indexOf("\n}\n", app.indexOf("function shareQueue(zone) {")));
  assert.match(body, /const queued = Boolean\(zone\) && !isLiveRadioZone\(zone\);/);
  assert.doesNotMatch(body, /items: zone \?/);
});
