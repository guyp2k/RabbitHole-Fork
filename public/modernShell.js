"use strict";
(function () {
  const SECTIONS = [
    { id: "listen", label: "Listen", groups: ["playback"] },
    { id: "discover", label: "Discover", groups: ["discover", "tidalLibrary"] },
    { id: "you", label: "You", groups: ["memory"] },
    { id: "system", label: "System", groups: ["system"] }
  ];

  function railSections(navItems, primaryLabels, viewHeading) {
    const perGroup = {};
    for (const nav of navItems) perGroup[nav.group] = (perGroup[nav.group] || 0) + 1;
    const sections = SECTIONS.map(({ id, label, groups }) => ({ id, label, groups, items: [] }));
    const used = new Set();
    for (const nav of navItems) {
      let section = sections.find((candidate) => candidate.groups.includes(nav.group));
      if (!section) {
        section = { id: nav.group, label: primaryLabels[nav.group] || nav.group, groups: [nav.group], items: [] };
        sections.push(section);
      }
      let label = nav.label;
      if (section.groups.length > 1 && perGroup[nav.group] === 1 && primaryLabels[nav.group]) label = primaryLabels[nav.group];
      if (used.has(label)) label = viewHeading(nav.view) || label;
      used.add(label);
      section.items.push({ ...nav, label });
    }
    return sections.filter((section) => section.items.length).map(({ id, label, items }) => ({ id, label, items }));
  }

  const titleCase = (text) => String(text || "").trim().split(/\s+/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

  function lyrionRailItems(tabs) {
    return [...tabs].map((tab) => ({ tab: tab.id, label: titleCase(tab.textContent) }));
  }

  const optionsOf = (select) => [...(select?.options || [])];

  function systemChoices(select) {
    return optionsOf(select).map((option) => ({ value: option.value, label: option.textContent, pressed: option.value === select.value }));
  }

  function chooseValue(select, value) {
    if (!optionsOf(select).some((option) => option.value === value)) return;
    select.value = value;
    select.dispatchEvent(new Event("change"));
  }

  function deviceMenu(system, select) {
    const items = optionsOf(select).filter((option) => option.value)
      .map((option) => ({ id: option.value, name: option.textContent, selected: option.value === select.value }));
    const selected = items.find((item) => item.selected);
    return { label: `${system === "lyrion" ? "Player" : "Zone"}: ${selected ? selected.name : "None"}`, items };
  }

  function openDeviceControls(system, id, select, { openRoonPlayerCard, lyrionOpeners }) {
    if (system !== "lyrion") {
      openRoonPlayerCard?.(id);
      return;
    }
    const index = optionsOf(select).filter((option) => option.value).findIndex((option) => option.value === id);
    if (index !== -1) lyrionOpeners[index]?.click();
  }

  function menuLinks(playbackAnchors, hqplayerAnchors) {
    const links = (anchors) => [...anchors].map((anchor) => ({ label: anchor.textContent.replace(/\s*↗\s*$/, "").trim(), href: anchor.href }));
    return [{ label: "", links: links(playbackAnchors) }, { label: "HQPlayer", links: links(hqplayerAnchors) }].filter((group) => group.links.length);
  }

  function pageVolumeHomes() {
    return [{ volume: "nowVolume", row: "#playerView .controls" }, { volume: "lyrionVolume", row: "#lyrionNow .lyrionActions" }];
  }

  function sectionOpen(id, { current, expanded, collapsed }) {
    if (collapsed.includes(id)) return false;
    return id === current || expanded.includes(id);
  }

  function toggleSection(id, state) {
    const expanded = state.expanded.filter((item) => item !== id);
    const collapsed = state.collapsed.filter((item) => item !== id);
    if (sectionOpen(id, state)) collapsed.push(id);
    else expanded.push(id);
    return { expanded, collapsed };
  }

  function roonPanelGroups() {
    return [
      { key: "rating", label: "Rating", selector: "#nowDiscoveryTools > #nowFeedback" },
      { key: "actions", label: "Actions", selector: "#nowDiscoveryTools > .nowDiscoveryActions" },
      { key: "playlists", label: "Playlists", selector: "#nowDiscoveryTools > .nowTidalPlaylistGroup" },
      { key: "system", label: "System", selector: "#playerView .nowInfo > #pcTempOverlay" }
    ];
  }

  function nowDetailsGroups() {
    return [
      { key: "roon:now playing", container: "#playerView .nowInfo", keep: "#pcTempOverlay" },
      { key: "lyrion:now playing", container: "#lyrionNow .lyrionNowDetails", keep: "#lyrionSystem" }
    ];
  }

  function ambientPalette(data) {
    const bins = new Map();
    for (let index = 0; index + 3 < data.length; index += 4) {
      const [r, g, b, a] = [data[index], data[index + 1], data[index + 2], data[index + 3]];
      if (a < 128) continue;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const weight = 1 + 3 * ((Math.max(r, g, b) - Math.min(r, g, b)) / 255);
      const bin = bins.get(key) || { r: 0, g: 0, b: 0, weight: 0, count: 0 };
      bin.r += r; bin.g += g; bin.b += b; bin.count += 1; bin.weight += weight;
      bins.set(key, bin);
    }
    if (!bins.size) return null;
    const colours = [...bins.values()].sort((x, y) => y.weight - x.weight)
      .map((bin) => [bin.r, bin.g, bin.b].map((channel) => channel / bin.count));
    const first = colours[0];
    const second = colours.find((colour) => Math.hypot(...colour.map((channel, at) => channel - first[at])) > 64) || first;
    const lift = (colour) => {
      const peak = Math.max(...colour);
      const scale = peak > 0 && peak < 140 ? 140 / peak : 1;
      return `rgb(${colour.map((channel) => Math.min(255, Math.round(channel * scale))).join(", ")})`;
    };
    return [lift(first), lift(second)];
  }

  function trackChanged(previous, next) {
    return previous !== null && Boolean(next) && next !== previous;
  }

  function signalChain({ transport, zoneName, state, hqplayer, output }) {
    if (!zoneName || !hqplayer?.rate || !output) return null;
    const stages = [];
    const source = hqplayer.source;
    if (source?.rate) {
      const rate = source.rate >= 1e6 ? `${+(source.rate / 1e6).toFixed(4)} MHz` : `${+(source.rate / 1000).toFixed(1)} kHz`;
      stages.push({ label: "Source", value: source.bits ? `${rate} / ${source.bits}-bit` : rate });
    }
    stages.push({ label: transport, value: `${zoneName} · ${state}` });
    const dsp = [hqplayer.filter, hqplayer.shaper].filter(Boolean).join(" · ");
    if (dsp) stages.push({ label: "HQPlayer", value: dsp });
    stages.push({ label: "Output", value: output });
    return stages;
  }

  function fitStageHeight({ stage, playerBottom, trailing, viewport, min, max }) {
    if (![stage, playerBottom, trailing, viewport].every(Number.isFinite)) return null;
    return Math.round(Math.min(max, Math.max(min, stage + viewport - playerBottom - trailing)));
  }

  function lyrionChainDetail(detail) {
    return detail.state === "playing" ? detail : { ...detail, hqplayer: null };
  }

  function readExtras(saved) {
    let value = {};
    try { value = JSON.parse(saved || "{}") || {}; } catch { value = {}; }
    return { upNext: value.upNext === true, spectrum: value.spectrum === true };
  }

  function upNextCards(items) {
    return (items || []).filter((item) => String(item.id || "").trim()).map((item) => ({
      id: String(item.id).trim(),
      title: item.title || "",
      artist: String(item.subtitle || "").split(/\s+-\s+/)[0].trim(),
      image: item.imageKey ? `/api/roon/image/${encodeURIComponent(item.imageKey)}?width=80&height=80` : ""
    }));
  }

  function lyrionUpNextCards(queue, queueIndex) {
    return (queue || []).filter((item) => item.index > queueIndex).sort((a, b) => a.index - b.index).slice(0, 5)
      .map((item) => ({ index: item.index, title: item.title || "", artist: item.artist || "", image: item.artwork || "" }));
  }

  function lyrionUpNextInfo(count, queueIndex) {
    const remaining = Math.max(0, (Number(count) || 0) - (Number(queueIndex) || 0) - 1);
    return remaining > 5 ? `${remaining} remaining` : "";
  }

  function formatLine(detail) {
    return detail?.text ? [detail.text, detail.note].filter(Boolean).join(" · ") : "";
  }

  function artworkFromCss(value) {
    const match = /url\(\s*["']?(.*?)["']?\s*\)/.exec(String(value || ""));
    return match && match[1] ? match[1] : null;
  }

  function readFolded(saved) {
    try {
      const value = JSON.parse(saved);
      return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  window.RabbitHoleModernShell = {
    railSections, lyrionRailItems, systemChoices, chooseSystem: chooseValue, deviceMenu,
    chooseDevice: chooseValue, openDeviceControls, menuLinks, pageVolumeHomes, sectionOpen, toggleSection,
    roonPanelGroups, readFolded, nowDetailsGroups, ambientPalette, artworkFromCss, trackChanged, signalChain, formatLine, fitStageHeight, lyrionChainDetail, readExtras, upNextCards, lyrionUpNextCards, lyrionUpNextInfo
  };

  if (!document.body.classList.contains("layoutModern")) return;

  const $ = (id) => document.getElementById(id);
  const make = (tag, attributes = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (name === "className") node.className = value;
      else if (name === "text") node.textContent = value;
      else if (name === "hidden") node.hidden = Boolean(value);
      else node.setAttribute(name, value);
    }
    node.append(...children);
    return node;
  };
  const svgNs = "http://www.w3.org/2000/svg";
  const icon = (paths) => {
    const svg = document.createElementNS(svgNs, "svg");
    for (const [name, value] of [["viewBox", "0 0 24 24"], ["aria-hidden", "true"], ["class", "modernIcon"], ["fill", "none"], ["stroke", "currentColor"], ["stroke-width", "2"], ["stroke-linecap", "round"], ["stroke-linejoin", "round"]]) svg.setAttribute(name, value);
    for (const d of paths) {
      const path = document.createElementNS(svgNs, "path");
      path.setAttribute("d", d);
      svg.append(path);
    }
    return svg;
  };
  const ICONS = {
    listen: ["M9 18V6l10-2v12", "M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z", "M19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z"],
    discover: ["M11 18a7 7 0 1 1 7-7 7 7 0 0 1-7 7Z", "m20 20-4-4"],
    you: ["M12 12a4 4 0 1 1 4-4 4 4 0 0 1-4 4Z", "M4 21c1.5-4 5-6 8-6s6.5 2 8 6"],
    system: ["M12 15a3 3 0 1 1 3-3 3 3 0 0 1-3 3Z", "M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"]
  };

  const system = () => (document.body.dataset.playbackSystem === "lyrion" ? "lyrion" : "roon");

  const navButtons = [...document.querySelectorAll(".secondaryNavShell [data-view]")];
  const primaryLabels = Object.fromEntries([...document.querySelectorAll(".primaryNav [data-nav-group]")].map((button) => [button.dataset.navGroup, button.textContent.trim()]));
  const viewHeading = (view) => $(`${view}View`)?.querySelector("h2")?.textContent.trim() || "";
  const sections = railSections(navButtons.map((source) => ({
    group: source.dataset.navGroup, item: source.dataset.navItem, view: source.dataset.view, label: source.textContent.trim(), source
  })), primaryLabels, viewHeading);
  const lyrionTabs = [...document.querySelectorAll("#lyrionView .lyrionTabs [role='tab']")];
  const railLinks = [];
  let railState = { expanded: [], collapsed: [] };

  const primaryButton = (group) => document.querySelector(`.primaryNav [data-nav-group="${group}"]`);
  const openSection = (section) => {
    const current = railLinks.some((link) => link.section === section.id && link.button.getAttribute("aria-current") === "page");
    if (!current) (primaryButton(section.items[0].group) || section.items[0].source).click();
  };

  const railSection = (section, attribute) => {
    const listId = `modernRail-${section.id}`;
    const list = make("ul", { className: "modernRailItems", id: listId });
    for (const item of section.items) {
      const button = make("button", { type: "button", className: "modernRailItem", text: item.label });
      button.addEventListener("click", () => item.source.click());
      railLinks.push({ button, source: item.source, section: section.id, attribute });
      list.append(make("li", {}, button));
    }
    const heading = make("button", { type: "button", className: "modernRailHeading", "aria-expanded": "false", "aria-controls": listId },
      make("span", { text: section.label }), make("span", { className: "modernCaret", "aria-hidden": "true", text: "▸" }));
    heading.addEventListener("click", () => { railState = { ...railState, ...toggleSection(section.id, { ...railState, current: currentRailSection() }) }; syncRail(); });
    return make("section", { className: "modernRailSection", "data-rail-section": section.id, "aria-label": section.label }, make("h2", { className: "modernRailTitle" }, heading), list);
  };

  const rail = make("nav", { className: "modernRail", "aria-label": "Main" });
  const brand = make("div", { className: "modernBrand" },
    make("span", { className: "modernBrandMark", "aria-hidden": "true" }),
    make("span", { className: "modernBrandName", text: "Rabbit Hole" }));
  const railBody = make("div", { className: "modernRailSections" });
  for (const section of sections) railBody.append(railSection(section, "aria-current"));
  if (lyrionTabs.length) {
    railBody.append(railSection({ id: "lyrion", label: "Lyrion", items: lyrionRailItems(lyrionTabs).map((item) => ({ ...item, source: $(item.tab) })) }, "aria-selected"));
  }
  const systemSelect = $("playbackSystem");
  const systemSwitch = make("div", { className: "modernSystemSwitch", role: "group", "aria-label": "Playback System" });
  for (const choice of systemChoices(systemSelect)) {
    const button = make("button", { type: "button", "data-system": choice.value, "aria-pressed": String(choice.pressed), text: choice.label });
    button.addEventListener("click", () => chooseValue(systemSelect, choice.value));
    systemSwitch.append(button);
  }

  const tabs = make("nav", { className: "modernTabs", "aria-label": "Sections" });
  for (const section of sections) {
    const button = make("button", { type: "button", "data-rail-tab": section.id }, icon(ICONS[section.id] || ICONS.listen), make("span", { text: section.label }));
    button.addEventListener("click", () => openSection(section));
    tabs.append(button);
  }

  const menuButton = (id, panelId) => make("button", { type: "button", id, className: "modernMenuButton", "aria-expanded": "false", "aria-controls": panelId });
  const zoneButton = menuButton("modernZoneMenuButton", "modernZoneMenu");
  const zonePanel = make("div", { id: "modernZoneMenu", className: "modernMenuPanel", hidden: true });
  const linksButton = menuButton("modernLinksMenuButton", "modernLinksMenu");
  linksButton.append(make("span", { text: "Links" }), make("span", { className: "modernCaret", "aria-hidden": "true", text: "▾" }));
  const linksPanel = make("div", { id: "modernLinksMenu", className: "modernMenuPanel", hidden: true });
  const zoneMenu = make("div", { className: "modernMenu" }, zoneButton);
  const linksMenu = make("div", { className: "modernMenu" }, linksButton);

  const railTools = make("div", { className: "modernRailTools" }, zoneMenu, linksMenu);
  rail.append(brand, railBody, systemSwitch, railTools);
  document.body.append(rail, tabs, zonePanel, linksPanel);

  for (const home of pageVolumeHomes()) {
    const control = $(home.volume);
    const row = document.querySelector(home.row);
    if (!control || !row) continue;
    control.classList.add("modernPageVolume");
    row.append(control);
  }

  const replay = (nodes, name) => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    for (const node of nodes) {
      node.classList.remove(name);
      void node.offsetWidth;
      node.classList.add(name);
      node.addEventListener("animationend", () => node.classList.remove(name), { once: true });
    }
  };

  const FOLDED_KEY = "rabbitHole.modernFolded";
  let foldedKeys = readFolded((() => { try { return localStorage.getItem(FOLDED_KEY); } catch { return null; } })());
  const foldButton = (label, key, apply) => {
    const folded = foldedKeys.includes(key);
    const caret = make("span", { className: "modernCaret", "aria-hidden": "true", text: folded ? "▸" : "▾" });
    const button = make("button", { type: "button", className: "modernFoldButton", "aria-expanded": String(!folded) }, make("span", { text: label }), caret);
    button.addEventListener("click", () => {
      const fold = button.getAttribute("aria-expanded") === "true";
      foldedKeys = fold ? [...foldedKeys.filter((item) => item !== key), key] : foldedKeys.filter((item) => item !== key);
      try { localStorage.setItem(FOLDED_KEY, JSON.stringify(foldedKeys)); } catch {}
      button.setAttribute("aria-expanded", String(!fold));
      caret.textContent = fold ? "▸" : "▾";
      const shown = apply(fold);
      if (!fold) replay(shown, "modernReveal");
    });
    apply(folded);
    return button;
  };
  for (const group of roonPanelGroups()) {
    const target = document.querySelector(group.selector);
    if (!target) continue;
    target.before(make("h3", { className: "modernPanelHeading" }, foldButton(group.label, `roon:${group.key}`, (fold) => { target.classList.toggle("modernFolded", fold); return [target]; })));
  }
  for (const group of nowDetailsGroups()) {
    const container = document.querySelector(group.container);
    if (!container) continue;
    container.prepend(make("h3", { className: "modernPanelHeading" }, foldButton("Now Playing", group.key, (fold) => { container.classList.toggle("modernNowFolded", fold); return [...container.children].filter((child) => !child.classList.contains("modernPanelHeading")); })));
  }
  for (const heading of document.querySelectorAll("#lyrionDiscoveryRail > section > h3, #lyrionSystem > h3")) {
    const label = heading.textContent.trim();
    const section = heading.parentElement;
    heading.replaceChildren(foldButton(label, `lyrion:${label.toLowerCase()}`, (fold) => { section.classList.toggle("modernSectionFolded", fold); return [...section.children].filter((child) => child !== heading); }));
  }

  const sources = {
    roon: { select: () => $("zoneSelect") },
    lyrion: { select: () => $("lyrionPlayer") }
  };
  const current = () => sources[system()];
  function syncDevices() {
    const menu = deviceMenu(system(), current().select());
    if (zoneButton.dataset.label !== menu.label) {
      zoneButton.dataset.label = menu.label;
      zoneButton.replaceChildren(make("span", { className: "modernMenuText", text: menu.label }), make("span", { className: "modernCaret", "aria-hidden": "true", text: "▾" }));
    }
    if (!zonePanel.hidden) renderDevicePanel();
  }

  function renderDevicePanel() {
    const kind = system();
    const select = current().select();
    const { items } = deviceMenu(kind, select);
    const list = make("ul", { className: "modernMenuList", "aria-label": kind === "lyrion" ? "Lyrion Players" : "Roon Zones" });
    for (const item of items) {
      const choose = make("button", { type: "button", className: "modernDeviceChoice", "aria-pressed": String(item.selected), text: item.name });
      choose.addEventListener("click", () => { chooseValue(select, item.id); closeMenus(zoneButton); });
      const controls = make("button", { type: "button", className: "modernDeviceCard", "aria-label": `Open ${item.name} Controls`, title: `${item.name} Controls`, text: "▸" });
      controls.addEventListener("click", () => {
        openDeviceControls(kind, item.id, select, { openRoonPlayerCard: window.openRoonPlayerCard, lyrionOpeners: [...document.querySelectorAll("#lyrionPlayerChoices .playerCardOpen")] });
        closeMenus();
      });
      list.append(make("li", { className: "modernDeviceRow" }, choose, controls));
    }
    const children = [items.length ? list : make("p", { className: "modernMenuEmpty", text: kind === "lyrion" ? "No Lyrion Players Found" : "No Roon Zones Found" })];
    if (kind === "lyrion" && $("lyrionRefresh")) {
      const refresh = make("button", { type: "button", className: "modernMenuAction", text: "Refresh Players" });
      refresh.addEventListener("click", () => $("lyrionRefresh").click());
      children.push(refresh);
    }
    zonePanel.replaceChildren(...children);
  }

  function syncLinks() {
    const groups = menuLinks(document.querySelectorAll("#playbackSystemLinks a"), document.querySelectorAll("#hqplayerLinkList a"));
    linksMenu.hidden = !groups.length;
    linksPanel.replaceChildren(...groups.map((group) => make("div", { className: "modernLinkGroup" },
      ...(group.label ? [make("p", { className: "modernMenuHeading", text: group.label })] : []),
      ...group.links.map((link) => make("a", { href: link.href, target: "_blank", rel: "noopener noreferrer" }, link.label, make("span", { "aria-hidden": "true", text: "↗" }))))));
  }

  let lastCurrent = "";
  function currentRailSection() {
    const kind = system();
    return railLinks.find((link) => link.button.getAttribute("aria-current") === "page" && (kind === "lyrion") === (link.section === "lyrion"))?.section || "";
  }

  function syncRail() {
    const kind = system();
    for (const link of railLinks) {
      const active = link.attribute === "aria-selected" ? link.source?.getAttribute("aria-selected") === "true" : link.source?.getAttribute("aria-current") === "page";
      if (active) link.button.setAttribute("aria-current", "page");
      else link.button.removeAttribute("aria-current");
    }
    const currentSection = currentRailSection();
    if (currentSection !== lastCurrent) {
      railState = { expanded: railState.expanded, collapsed: railState.collapsed.filter((id) => id !== currentSection) };
      lastCurrent = currentSection;
    }
    for (const section of railBody.children) {
      const id = section.dataset.railSection;
      const open = sectionOpen(id, { ...railState, current: currentSection });
      section.classList.toggle("isCurrent", id === currentSection);
      section.classList.toggle("isOpen", open);
      const heading = section.querySelector("button.modernRailHeading");
      if (heading) {
        heading.setAttribute("aria-expanded", String(open));
        heading.querySelector(".modernCaret").textContent = open ? "▾" : "▸";
      }
    }
    for (const tab of tabs.children) {
      if (tab.dataset.railTab === currentSection) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    }
    for (const button of systemSwitch.children) button.setAttribute("aria-pressed", String(button.dataset.system === kind));
  }

  let queued = false;
  function schedule() {
    syncRail();
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncDevices();
    });
  }

  function closeMenus(focus = null) {
    for (const [button, panel] of [[zoneButton, zonePanel], [linksButton, linksPanel]]) {
      button.setAttribute("aria-expanded", "false");
      panel.hidden = true;
    }
    focus?.focus();
  }
  function toggleMenu(button, panel, render) {
    const open = panel.hidden;
    closeMenus();
    if (!open) return;
    render();
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
  }
  zoneButton.addEventListener("click", () => toggleMenu(zoneButton, zonePanel, renderDevicePanel));
  linksButton.addEventListener("click", () => toggleMenu(linksButton, linksPanel, syncLinks));
  document.addEventListener("click", (event) => {
    const inside = [zoneMenu, linksMenu, zonePanel, linksPanel].some((node) => node.contains(event.target));
    if (!inside) closeMenus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = [[zoneButton, zonePanel], [linksButton, linksPanel]].find(([, panel]) => !panel.hidden);
    if (open) closeMenus(open[0]);
  });

  const sizes = new ResizeObserver(() => {
    document.body.style.setProperty("--modern-tabs-height", `${tabs.offsetHeight}px`);
    document.body.style.setProperty("--modern-rail-height", `${rail.offsetHeight}px`);
  });
  for (const node of [tabs, rail]) sizes.observe(node);

  const watch = (node, options) => { if (node) new MutationObserver(schedule).observe(node, options); };
  watch(document.querySelector(".secondaryNav"), { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
  watch(document.querySelector("#lyrionView .lyrionTabs"), { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  watch(document.body, { attributes: true, attributeFilter: ["data-playback-system"] });
  watch($("zoneSelect"), { childList: true, subtree: true });
  watch($("lyrionPlayer"), { childList: true, subtree: true });
  for (const select of [$("zoneSelect"), $("lyrionPlayer"), systemSelect]) select?.addEventListener("change", schedule);
  for (const links of [$("playbackSystemLinks"), $("hqplayerLinkList")]) if (links) new MutationObserver(syncLinks).observe(links, { childList: true });

  document.body.prepend(make("div", { className: "modernAmbient", "aria-hidden": "true" }));
  let ambientUrl = null;
  const ambientCanvas = document.createElement("canvas");
  ambientCanvas.width = ambientCanvas.height = 32;
  const clearAmbient = () => document.body.classList.remove("modernAmbientOn");
  function syncAmbient() {
    const lyrionCover = $("lyrionCover");
    const url = system() === "lyrion"
      ? (lyrionCover && !lyrionCover.hidden && lyrionCover.getAttribute("src")) || null
      : artworkFromCss(document.body.style.getPropertyValue("--now-artwork-backdrop"));
    if (url === ambientUrl) return;
    ambientUrl = url;
    if (!url) return clearAmbient();
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (url !== ambientUrl) return;
      let palette = null;
      try {
        const context = ambientCanvas.getContext("2d", { willReadFrequently: true });
        context.clearRect(0, 0, 32, 32);
        context.drawImage(image, 0, 0, 32, 32);
        palette = ambientPalette(context.getImageData(0, 0, 32, 32).data);
      } catch {
        palette = null;
      }
      if (!palette) return clearAmbient();
      document.documentElement.style.setProperty("--ambient-1", palette[0]);
      document.documentElement.style.setProperty("--ambient-2", palette[1]);
      document.body.classList.add("modernAmbientOn");
    };
    image.onerror = () => { if (url === ambientUrl) clearAmbient(); };
    image.src = url;
  }
  new MutationObserver(syncAmbient).observe(document.body, { attributes: true, attributeFilter: ["style", "data-playback-system"] });
  const lyrionCoverNode = $("lyrionCover");
  if (lyrionCoverNode) new MutationObserver(syncAmbient).observe(lyrionCoverNode, { attributes: true, attributeFilter: ["src", "hidden"] });

  const chainStrip = make("div", { className: "modernSignalChain", "aria-label": "Signal Chain", hidden: true });
  document.querySelector("#playerView .seekBlock")?.after(chainStrip);
  const lyrionChainStrip = make("div", { className: "modernSignalChain", "aria-label": "Signal Chain", hidden: true });
  document.querySelector("#lyrionNow .lyrionStageFooter")?.after(lyrionChainStrip);
  const tidyWires = (strip) => {
    for (const wire of strip.querySelectorAll(".modernChainWire")) {
      const previous = wire.previousElementSibling, next = wire.nextElementSibling;
      wire.style.visibility = next.getBoundingClientRect().top >= previous.getBoundingClientRect().bottom ? "hidden" : "";
    }
  };
  for (const strip of [chainStrip, lyrionChainStrip]) new ResizeObserver(() => tidyWires(strip)).observe(strip);
  function renderSignalChain(strip, detail, transport) {
    const stages = signalChain({ transport, zoneName: detail.zoneName, state: detail.state, hqplayer: detail.hqplayer, output: hqplayerRows(detail.hqplayer)[0]?.[1] || "" });
    if (!stages) {
      strip.replaceChildren();
      strip.hidden = true;
      return;
    }
    const pills = make("div", { className: "modernChainStages" });
    stages.forEach((stage, index) => {
      if (index) pills.append(make("span", { className: "modernChainWire", "aria-hidden": "true" }));
      pills.append(make("div", { className: "modernChainStage" }, make("b", { text: stage.label }), make("span", { text: stage.value })));
    });
    const parts = hqpHostParts(detail.hqplayer) || [];
    const host = make("p", { className: "hqpHostLine modernChainHost", hidden: !parts.length }, make("span", { className: "hqpHostTag", text: "HQP host" }));
    parts.forEach((part, index) => {
      if (index) host.append(" · ");
      const span = make("span", { text: part.text });
      if (part.level) span.dataset.level = part.level;
      host.append(span);
    });
    strip.replaceChildren(pills, host);
    strip.hidden = false;
    tidyWires(strip);
  }
  const stagePlayer = document.querySelector("#playerView .player"), shellNode = document.querySelector(".shell");
  function fitStage() {
    const player = stagePlayer;
    if (!player || !shellNode) return;
    const regular = player.classList.contains("player--regular") && !player.classList.contains("isMaximized") && !player.classList.contains("isFullWindow");
    if (!regular || !player.offsetParent || innerWidth < 1100) {
      player.style.removeProperty("--rh-regular-stage-height");
      return;
    }
    const stage = parseFloat(getComputedStyle(player).gridTemplateRows.split(" ")[1]);
    const box = player.getBoundingClientRect();
    const next = fitStageHeight({ stage, playerBottom: box.bottom, trailing: shellNode.getBoundingClientRect().bottom - box.bottom, viewport: innerHeight, min: 320, max: 660 });
    if (next !== null && Math.abs(next - stage) >= 2) player.style.setProperty("--rh-regular-stage-height", `${next}px`);
  }
  if (stagePlayer) {
    new ResizeObserver(fitStage).observe(stagePlayer);
    new MutationObserver(fitStage).observe(stagePlayer, { attributes: true, attributeFilter: ["class"] });
  }
  window.addEventListener("resize", fitStage);
  const showFormat = (node, detail) => {
    node.textContent = formatLine(detail);
    node.hidden = !node.textContent;
  };
  const formatLineNode = make("p", { className: "modernFormatLine", hidden: true });
  $("nowPlaybackChain")?.after(formatLineNode);
  document.querySelector("#playerView .player")?.addEventListener("roon-format", ({ detail }) => showFormat(formatLineNode, detail));
  const lyrionFormatNode = make("p", { className: "modernFormatLine", hidden: true });
  $("lyrionChain")?.after(lyrionFormatNode);
  $("lyrionNow")?.addEventListener("lyrion-format", ({ detail }) => showFormat(lyrionFormatNode, detail));
  const playback = $("nowPlayback"), artStack = document.querySelector("#playerView .player > .artStack");
  if (playback && artStack) new ResizeObserver(() => artStack.style.setProperty("--modern-strip-height", `${playback.offsetHeight}px`)).observe(playback);
  document.querySelector("#playerView .player")?.addEventListener("roon-signal", ({ detail }) => renderSignalChain(chainStrip, detail, "Roon"));
  $("lyrionNow")?.addEventListener("lyrion-signal", ({ detail }) => renderSignalChain(lyrionChainStrip, lyrionChainDetail(detail), "Lyrion"));

  const EXTRAS_KEY = "rabbitHole.modernExtras";
  let extras = readExtras((() => { try { return localStorage.getItem(EXTRAS_KEY); } catch { return null; } })());
  const applyExtras = () => {
    document.body.classList.toggle("modernUpNextOn", extras.upNext);
    document.body.classList.toggle("modernSpectrumOn", extras.spectrum);
  };
  const extraToggles = [];
  for (const home of [$("togglePlayerMax"), $("lyrionFullscreen")]) {
    if (!home) continue;
    for (const [key, label, tip] of [["upNext", "Up next", "Show the next covers in the queue"], ["spectrum", "Spectrum", "Decorative: moves with playback, not live audio levels"]]) {
      const toggle = make("button", { type: "button", className: "modernExtraToggle", "data-extra": key, "aria-pressed": String(extras[key]), title: tip },
        make("span", { className: "modernExtraDot", "aria-hidden": "true" }), make("span", { text: label }));
      toggle.addEventListener("click", () => {
        extras = { ...extras, [key]: !extras[key] };
        for (const other of extraToggles) if (other.dataset.extra === key) other.setAttribute("aria-pressed", String(extras[key]));
        try { localStorage.setItem(EXTRAS_KEY, JSON.stringify(extras)); } catch {}
        applyExtras();
      });
      extraToggles.push(toggle);
      home.before(toggle);
    }
  }
  applyExtras();

  const makeSpectrum = () => {
    const node = make("div", { className: "modernSpectrum", "aria-hidden": "true" });
    for (let bar = 0; bar < 32; bar += 1) {
      const x = bar / 31;
      const height = 20 + 70 * Math.abs(Math.sin(bar * 0.9) * Math.cos(bar * 0.23)) * (1 - 0.5 * x);
      const barNode = make("i");
      barNode.style.setProperty("--h", `${Math.round(height)}%`);
      barNode.style.setProperty("--d", `${(0.55 + ((bar * 7) % 9) * 0.08).toFixed(2)}s`);
      node.append(barNode);
    }
    return node;
  };
  const spectrum = makeSpectrum();
  $("nowPlayback")?.append(spectrum);
  document.querySelector("#playerView .player")?.addEventListener("roon-playback", ({ detail }) => spectrum.classList.toggle("isPlaying", detail.state === "playing"));
  const lyrionSpectrum = makeSpectrum();
  $("lyrionPlayback")?.append(lyrionSpectrum);
  $("lyrionNow")?.addEventListener("lyrion-playback", ({ detail }) => lyrionSpectrum.classList.toggle("isPlaying", detail.state === "playing"));

  const upNextArt = (card) => card.image ? make("img", { src: card.image, alt: "", loading: "lazy" }) : make("span", { className: "modernUpNextBlank", "aria-hidden": "true" });
  const upNextText = (card) => make("span", { className: "queueText" }, make("strong", { className: "queueItemTitle", text: card.title }), make("small", { text: card.artist }));

  const lyrionUpNextStrip = make("div", { className: "modernUpNextStrip", hidden: true });
  $("lyrionPlayback")?.append(lyrionUpNextStrip);
  let lyrionUpNextKey = "";
  $("lyrionNow")?.addEventListener("lyrion-queue", ({ detail }) => {
    const cards = lyrionUpNextCards(detail.items, detail.index);
    const info = lyrionUpNextInfo(detail.count, detail.index);
    const key = JSON.stringify([info, cards]);
    if (key === lyrionUpNextKey) return;
    lyrionUpNextKey = key;
    lyrionUpNextStrip.hidden = !cards.length;
    if (!cards.length) { lyrionUpNextStrip.replaceChildren(); return; }
    const list = make("ol", { className: "modernUpNextList" });
    for (const card of cards) {
      const button = make("button", { type: "button", className: "modernUpNextCard", title: `${card.title}: play from here` }, upNextArt(card), upNextText(card));
      button.addEventListener("click", () => $("lyrionQueue")?.querySelector(`[data-queue-index="${card.index}"]`)?.click());
      list.append(make("li", {}, button));
    }
    lyrionUpNextStrip.replaceChildren(make("h4", { text: info ? `Up next · ${info}` : "Up next" }), list);
  });

  const upNextStrip = make("div", { className: "modernUpNextStrip", hidden: true });
  $("nowPlayback")?.append(upNextStrip);
  let upNextKey = "";
  document.querySelector("#playerView .player")?.addEventListener("roon-queue", ({ detail }) => {
    const cards = upNextCards(detail.items);
    const key = JSON.stringify([detail.info, cards]);
    if (key === upNextKey) return;
    upNextKey = key;
    if (!cards.length) {
      upNextStrip.replaceChildren();
      upNextStrip.hidden = true;
      return;
    }
    const list = make("ol", { className: "modernUpNextList" });
    for (const card of cards) {
      list.append(make("li", {}, make("button", { type: "button", className: "queueItemButton modernUpNextCard", "data-queue-item-id": card.id, "aria-haspopup": "menu", "aria-controls": "queueActionMenu", "aria-expanded": "false", title: `${card.title}: tap or hold for Play from here` },
        upNextArt(card), upNextText(card))));
    }
    upNextStrip.replaceChildren(make("h4", { text: detail.info ? `Up next · ${detail.info}` : "Up next" }), list);
    upNextStrip.hidden = false;
  });
  const queueMenu = $("queueActionMenu");
  if (queueMenu) document.body.append(queueMenu);

  const text = (node) => node.textContent.trim();
  const TRACK_WATCH = [
    ["cover", (node) => node.style.backgroundImage],
    ["nowTitle", text],
    ["nowSubtitle", text],
    ["lyrionCover", (node) => node.getAttribute("src") || ""],
    ["lyrionTitle", text],
    ["lyrionArtist", text]
  ];
  for (const [id, read] of TRACK_WATCH) {
    const node = $(id);
    if (!node) continue;
    let previous = read(node) || null;
    new MutationObserver(() => {
      const next = read(node);
      if (trackChanged(previous, next)) replay([node], "modernTrackIn");
      if (next) previous = next;
    }).observe(node, { attributes: true, attributeFilter: ["style", "src"], childList: true, subtree: true, characterData: true });
  }

  syncLinks();
  syncRail();
  syncDevices();
  syncAmbient();
})();
