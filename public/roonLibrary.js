"use strict";
(() => {
  function filterSummary({ text, selects, toggles }) {
    const parts = [];
    const search = String(text || "").trim();
    if (search) parts.push(`\u201c${search}\u201d`);
    for (const select of selects) {
      if (!select.value || (select.name === "sort" && select.value === "artist")) continue;
      parts.push(String(select.label).replace(/\s*\(\d[\d,]*\)$/, ""));
    }
    parts.push(...toggles);
    return parts.join(" · ");
  }
  window.RoonLibraryFilters = { filterSummary };

  const $ = (selector) => document.querySelector(selector);
  const form = $("#rlFilters");
  const results = $("#rlResults");
  const status = $("#rlStatus");
  const more = $("#rlMore");
  if (!form || !results) return;
  const ACTIONS = [["play", "Play"], ["next", "Play Next"], ["queue", "Queue"], ["radio", "Start Radio"]];
  const state = { loaded: false, offset: 0, total: 0, request: 0, debounce: 0 };

  const el = (tag, props = {}, children = []) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const child of children) if (child) node.append(child);
    return node;
  };

  function query(offset) {
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) if (String(value).trim()) params.set(name, String(value).trim());
    for (const button of form.querySelectorAll("[data-rl-toggle][aria-pressed='true']")) params.set(button.dataset.rlToggle, button.dataset.rlValue || "true");
    if (offset) params.set("offset", String(offset));
    return params;
  }

  async function getJson(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }

  function card(album) {
    const art = el("span", { className: "dbArtwork rlArtwork" });
    if (album.image) art.append(el("img", { src: album.image, alt: "", loading: "lazy", decoding: "async" }));
    const meta = [album.artist, album.year, album.format].filter(Boolean).join(" · ");
    const actions = el("div", { className: "rlActions" }, ACTIONS.map(([action, label]) =>
      el("button", { type: "button", textContent: label, className: action === "play" ? "rlPrimary" : "" })));
    actions.querySelectorAll("button").forEach((button, index) => { button.dataset.rlAction = ACTIONS[index][0]; button.dataset.rlKey = album.key; button.dataset.rlTitle = album.title; });
    return el("li", { className: "rlCard" }, [
      el("div", { className: "dbMosaic dbAlbumCover" }, [art]),
      el("span", { className: "dbCollectionName", textContent: album.title, title: album.title }),
      el("span", { className: "dbCollectionMeta", textContent: meta, title: meta }),
      actions
    ]);
  }

  async function load({ append = false } = {}) {
    const request = ++state.request;
    const offset = append ? state.offset : 0;
    status.textContent = "Loading your Roon library…";
    try {
      const payload = await getJson(`/api/roon-library/albums?${query(offset)}`);
      if (request !== state.request) return;
      if (!append) results.replaceChildren();
      results.append(...payload.albums.map(card));
      state.total = payload.total;
      state.offset = offset + payload.albums.length;
      more.hidden = state.offset >= state.total;
      status.textContent = state.total ? `${state.total.toLocaleString()} albums · showing ${state.offset.toLocaleString()}` : "No albums match these filters.";
    } catch (error) {
      if (request !== state.request) return;
      if (!append) results.replaceChildren();
      more.hidden = true;
      status.textContent = error.message;
    }
  }

  async function loadFocus() {
    try {
      const focus = await getJson("/api/roon-library/focus");
      const library = form.elements.storage;
      for (const item of focus.libraries || []) library.append(el("option", { value: item.name, textContent: `${item.name} (${item.albums})` }));
      const genre = form.elements.genre;
      for (const item of focus.genres) genre.append(el("option", { value: item.name, textContent: `${item.name} (${item.albums})` }));
      const decade = form.elements.decade;
      for (const item of focus.decades) {
        const year = parseInt(item.decade, 10);
        if (Number.isInteger(year)) decade.append(el("option", { value: String(year), textContent: `${item.decade} (${item.albums})` }));
      }
    } catch {}
  }

  async function act(button) {
    const zoneId = localStorage.getItem("zoneId") || "";
    if (!zoneId) { status.textContent = "Pick a Roon zone first."; return; }
    const label = button.textContent;
    button.disabled = true;
    status.textContent = `${label}: ${button.dataset.rlTitle}…`;
    try {
      const result = await getJson("/api/roon-library/play", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: button.dataset.rlKey, zoneId, action: button.dataset.rlAction }) });
      status.textContent = `${result.action}: ${result.match?.title || button.dataset.rlTitle}`;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  const FOLD_KEY = "rabbitHole.rlFiltersFolded";
  const fold = el("button", { type: "button", className: "rlFiltersFold" });
  fold.setAttribute("aria-controls", "rlFilters");
  const foldSummary = el("span", { className: "rlFiltersSummary" });
  const caret = el("span", { className: "rlFiltersCaret" });
  caret.setAttribute("aria-hidden", "true");
  fold.append(el("span", { className: "rlFiltersTitle" }, [el("span", { textContent: "Filters" }), foldSummary]), caret);
  form.before(fold);
  let folded = (() => { try { return localStorage.getItem(FOLD_KEY) === "1"; } catch { return false; } })();
  function summarise() {
    const selects = [...form.querySelectorAll("select")].map((select) => ({ name: select.name, value: select.value, label: select.selectedOptions[0]?.textContent || "" }));
    const toggles = [...form.querySelectorAll("[data-rl-toggle][aria-pressed='true']")].map((button) => button.textContent.trim());
    const summary = filterSummary({ text: form.elements.text?.value || "", selects, toggles });
    foldSummary.textContent = summary ? ` · ${summary}` : "";
  }
  function applyFold() {
    fold.setAttribute("aria-expanded", String(!folded));
    form.hidden = folded;
    caret.textContent = folded ? "▸" : "▾";
  }
  fold.addEventListener("click", () => {
    folded = !folded;
    try { localStorage.setItem(FOLD_KEY, folded ? "1" : "0"); } catch {}
    applyFold();
  });
  applyFold();
  summarise();

  form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
  form.addEventListener("change", summarise);
  form.addEventListener("input", summarise);
  form.addEventListener("change", () => load());
  form.addEventListener("input", (event) => {
    if (event.target.name !== "text") return;
    clearTimeout(state.debounce);
    state.debounce = setTimeout(() => load(), 350);
  });
  form.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-rl-toggle]");
    if (!toggle) return;
    toggle.setAttribute("aria-pressed", toggle.getAttribute("aria-pressed") === "true" ? "false" : "true");
    summarise();
    load();
  });
  results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rl-action]");
    if (button) act(button);
  });
  more.addEventListener("click", () => load({ append: true }));

  window.RoonLibraryUi = {
    show() {
      if (state.loaded) return;
      state.loaded = true;
      loadFocus();
      load();
    }
  };
})();
