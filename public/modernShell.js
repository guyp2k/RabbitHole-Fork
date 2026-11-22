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

  function splitTime(text) {
    const [position = "", length = ""] = String(text || "").split(" / ");
    return [position, length];
  }

  function forwardRange(target, value, type) {
    if (!target || target.disabled) return;
    target.value = String(value);
    target.dispatchEvent(new Event(type));
  }

  window.RabbitHoleModernShell = {
    railSections, lyrionRailItems, systemChoices, chooseSystem: chooseValue, deviceMenu,
    chooseDevice: chooseValue, openDeviceControls, menuLinks, splitTime, forwardRange
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
    system: ["M12 15a3 3 0 1 1 3-3 3 3 0 0 1-3 3Z", "M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"],
    previous: ["M19 5 9 12l10 7V5Z", "M5 5v14"],
    next: ["m5 5 10 7-10 7V5Z", "M19 5v14"],
    play: ["M7 4.5v15L19 12 7 4.5Z"],
    pause: ["M9 5v14", "M15 5v14"]
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
    let heading;
    if (attribute === "aria-current") {
      heading = make("button", { type: "button", className: "modernRailHeading", "aria-expanded": "false", "aria-controls": listId, text: section.label });
      heading.addEventListener("click", () => openSection(section));
    } else {
      heading = make("span", { className: "modernRailHeading", text: section.label });
    }
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
  rail.append(brand, railBody, systemSwitch);

  const tabs = make("nav", { className: "modernTabs", "aria-label": "Sections" });
  for (const section of sections) {
    const button = make("button", { type: "button", "data-rail-tab": section.id }, icon(ICONS[section.id] || ICONS.listen), make("span", { text: section.label }));
    button.addEventListener("click", () => openSection(section));
    tabs.append(button);
  }

  const art = make("span", { className: "modernArt", "aria-hidden": "true" });
  const nowTitle = make("strong", { className: "modernNowTitle" });
  const nowArtist = make("span", { className: "modernNowArtist" });
  const transportButton = (control, label, paths) => {
    const button = make("button", { type: "button", className: "modernTransportButton", "data-modern-control": control, "aria-label": label, title: label }, icon(paths));
    button.addEventListener("click", () => sourceControl(control)?.click());
    return button;
  };
  const previous = transportButton("previous", "Previous", ICONS.previous);
  const playPause = transportButton("playpause", "Play", ICONS.play);
  playPause.classList.add("modernPlayPause");
  const next = transportButton("next", "Next", ICONS.next);
  const seekPosition = make("span", { className: "modernSeekTime" });
  const seekLength = make("span", { className: "modernSeekTime" });
  const seek = make("input", { type: "range", className: "modernSeek", "aria-label": "Seek Position", min: "0", max: "0", value: "0" });
  const volume = make("input", { type: "range", className: "modernVolumeSlider", "aria-label": "Volume" });
  const volumeLabel = make("label", { className: "modernVolume" }, make("span", { text: "Volume" }), volume);

  const menuButton = (id, panelId) => make("button", { type: "button", id, className: "modernMenuButton", "aria-expanded": "false", "aria-controls": panelId });
  const zoneButton = menuButton("modernZoneMenuButton", "modernZoneMenu");
  const zonePanel = make("div", { id: "modernZoneMenu", className: "modernMenuPanel", hidden: true });
  const linksButton = menuButton("modernLinksMenuButton", "modernLinksMenu");
  linksButton.append(make("span", { text: "Links" }), make("span", { className: "modernCaret", "aria-hidden": "true", text: "▾" }));
  const linksPanel = make("div", { id: "modernLinksMenu", className: "modernMenuPanel", hidden: true });
  const zoneMenu = make("div", { className: "modernMenu" }, zoneButton, zonePanel);
  const linksMenu = make("div", { className: "modernMenu" }, linksButton, linksPanel);

  const bar = make("footer", { className: "modernPlayerBar", "aria-label": "Player" },
    make("div", { className: "modernNow" }, art, make("div", { className: "modernNowText" }, nowTitle, nowArtist)),
    make("div", { className: "modernTransport" },
      make("div", { className: "modernTransportButtons" }, previous, playPause, next),
      make("div", { className: "modernSeekRow" }, seekPosition, seek, seekLength)),
    make("div", { className: "modernBarTools" }, zoneMenu, linksMenu, volumeLabel));

  document.body.append(rail, tabs, bar);

  let lyrionState = "";
  $("lyrionNow")?.addEventListener("lyrion-playback", (event) => { lyrionState = event.detail?.state || ""; schedule(); });

  const sources = {
    roon: {
      title: () => $("nowTitle")?.textContent || "",
      artist: () => $("nowSubtitle")?.textContent || "",
      art: () => $("cover")?.style.backgroundImage || "",
      playing: () => ($("playState")?.textContent || "").trim() === "playing",
      control: (name) => document.querySelector(`#playerView .controls [data-control="${name}"]`),
      seek: () => $("seekSlider"),
      times: () => [$("seekPosition")?.textContent || "", $("seekLength")?.textContent || ""],
      volume: () => $("nowVolume"),
      select: () => $("zoneSelect")
    },
    lyrion: {
      title: () => $("lyrionTitle")?.textContent || "",
      artist: () => $("lyrionArtist")?.textContent || "",
      art: () => { const cover = $("lyrionCover"); return cover && !cover.hidden && cover.src ? `url("${cover.src.replace(/"/g, "%22")}")` : ""; },
      playing: () => lyrionState === "playing",
      control: (name) => document.querySelector(`#lyrionNow [data-lyrion-control="${name}"]`),
      seek: () => $("lyrionProgress"),
      times: () => splitTime($("lyrionTime")?.textContent),
      volume: () => $("lyrionVolume"),
      select: () => $("lyrionPlayer")
    }
  };
  const current = () => sources[system()];
  const sourceControl = (name) => current().control(name);
  const volumeSource = () => {
    const root = current().volume();
    const slider = root?.querySelector(".volumeSlider");
    return root && !root.hidden && slider && !slider.hidden ? slider : null;
  };

  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const held = { seek: false, volume: false };
  const mirrorRange = (target, from, key) => {
    target.disabled = !from || from.disabled;
    if (!from || held[key]) return;
    for (const name of ["min", "max", "step"]) if (target[name] !== from[name]) target[name] = from[name];
    if (target.value !== from.value) target.value = from.value;
    const span = Number(target.max) - Number(target.min);
    target.style.setProperty("--modern-progress", `${span > 0 ? ((Number(target.value) - Number(target.min)) / span) * 100 : 0}%`);
  };

  function syncBar() {
    const source = current();
    setText(nowTitle, source.title().trim());
    setText(nowArtist, source.artist().trim());
    const image = source.art();
    if (art.style.backgroundImage !== image) art.style.backgroundImage = image;
    art.classList.toggle("hasArt", Boolean(image));
    const playing = source.playing();
    const label = playing ? "Pause" : "Play";
    if (playPause.getAttribute("aria-label") !== label) {
      playPause.setAttribute("aria-label", label);
      playPause.title = label;
      playPause.replaceChildren(icon(playing ? ICONS.pause : ICONS.play));
    }
    for (const [button, name] of [[previous, "previous"], [playPause, "playpause"], [next, "next"]]) {
      const target = source.control(name);
      button.disabled = !target || target.disabled;
    }
    mirrorRange(seek, source.seek(), "seek");
    const [position, length] = source.times();
    setText(seekPosition, position);
    setText(seekLength, length);
    const slider = volumeSource();
    volumeLabel.hidden = !slider;
    mirrorRange(volume, slider, "volume");
  }

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

  function syncRail() {
    const kind = system();
    for (const link of railLinks) {
      const active = link.attribute === "aria-selected" ? link.source?.getAttribute("aria-selected") === "true" : link.source?.getAttribute("aria-current") === "page";
      if (active) link.button.setAttribute("aria-current", "page");
      else link.button.removeAttribute("aria-current");
    }
    const currentSection = railLinks.find((link) => link.button.getAttribute("aria-current") === "page" && (kind === "lyrion") === (link.section === "lyrion"))?.section || "";
    for (const section of railBody.children) {
      const isCurrent = section.dataset.railSection === currentSection;
      section.classList.toggle("isCurrent", isCurrent);
      section.querySelector("button.modernRailHeading")?.setAttribute("aria-expanded", String(isCurrent));
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
      syncBar();
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
  document.addEventListener("click", (event) => { if (!zoneMenu.contains(event.target) && !linksMenu.contains(event.target)) closeMenus(); });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const open = [[zoneButton, zonePanel], [linksButton, linksPanel]].find(([, panel]) => !panel.hidden);
    if (open) closeMenus(open[0]);
  });

  const bindRange = (input, key, target) => {
    input.addEventListener("pointerdown", () => { held[key] = true; });
    input.addEventListener("input", () => { held[key] = true; forwardRange(target(), input.value, "input"); });
    input.addEventListener("change", () => { forwardRange(target(), input.value, "change"); held[key] = false; });
    input.addEventListener("blur", () => { held[key] = false; });
  };
  bindRange(seek, "seek", () => current().seek());
  bindRange(volume, "volume", volumeSource);

  const sizes = new ResizeObserver(() => {
    document.body.style.setProperty("--modern-bar-height", `${bar.offsetHeight}px`);
    document.body.style.setProperty("--modern-tabs-height", `${tabs.offsetHeight}px`);
    document.body.style.setProperty("--modern-rail-height", `${rail.offsetHeight}px`);
  });
  for (const node of [bar, tabs, rail]) sizes.observe(node);

  const watch = (node, options) => { if (node) new MutationObserver(schedule).observe(node, options); };
  watch(document.querySelector(".secondaryNav"), { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
  watch(document.querySelector("#lyrionView .lyrionTabs"), { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  watch(document.body, { attributes: true, attributeFilter: ["data-playback-system"] });
  const playbackChanges = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["style", "hidden", "disabled", "src", "class"] };
  watch($("playerView"), playbackChanges);
  watch($("lyrionNow"), playbackChanges);
  watch($("zoneSelect"), { childList: true, subtree: true });
  watch($("lyrionPlayer"), { childList: true, subtree: true });
  for (const select of [$("zoneSelect"), $("lyrionPlayer"), systemSelect]) select?.addEventListener("change", schedule);
  for (const links of [$("playbackSystemLinks"), $("hqplayerLinkList")]) if (links) new MutationObserver(syncLinks).observe(links, { childList: true });

  syncLinks();
  syncRail();
  syncBar();
  syncDevices();
})();
