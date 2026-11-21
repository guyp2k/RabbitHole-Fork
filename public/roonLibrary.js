"use strict";
(() => {
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
      el("span", { className: "dbCollectionName", textContent: album.title }),
      el("span", { className: "dbCollectionMeta", textContent: meta }),
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

  form.addEventListener("submit", (event) => { event.preventDefault(); load(); });
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
