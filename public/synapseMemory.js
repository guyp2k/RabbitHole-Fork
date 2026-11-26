"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  if (!$("synapseMemoryView")) return;
  let state = null;
  let loaded = false;
  const SMALL_WORDS = new Set(["a", "an", "and", "or", "of", "to", "the", "in", "on", "for", "by", "with"]);
  const SOURCE_LABELS = {
    explicit_user: "Added by You",
    manual_import: "Imported",
    inferred: "Inferred",
    rabbit_hole_taste: "Learned From Your Ratings",
    rabbit_hole_standby: "From Standby Picks",
    conversation_excerpt: "From a Conversation",
    conversation_user_statement: "From Something You Said"
  };
  const LONG_TEXT = 280;

  function labelCase(slug = "") {
    return String(slug).split(/[_\s]+/).filter(Boolean)
      .map((word, index) => (index > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1)))
      .join(" ");
  }

  function sourceLabel(source = "") {
    return SOURCE_LABELS[source] || labelCase(source) || "Unknown Source";
  }

  function formatWhen(iso) {
    const time = Date.parse(iso || "");
    if (!Number.isFinite(time)) return "Never";
    return new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function sortEntries(entries, sort) {
    const time = (entry) => Date.parse(entry.updatedAt || "") || 0;
    const sorted = [...entries];
    if (sort === "oldest") sorted.sort((a, b) => time(a) - time(b));
    else if (sort === "importance") sorted.sort((a, b) => Number(b.importance || 0) - Number(a.importance || 0) || time(b) - time(a));
    else if (sort === "category") sorted.sort((a, b) => labelCase(a.category).localeCompare(labelCase(b.category)) || time(b) - time(a));
    else sorted.sort((a, b) => time(b) - time(a));
    return sorted;
  }

  function statsText(memory) {
    const count = Number(memory.count || 0);
    const categories = (memory.categories || []).filter((item) => Number(item.count) > 0).map((item) => `${labelCase(item.category)} ${item.count}`).join(", ");
    return [
      `${count} ${count === 1 ? "Memory" : "Memories"}`,
      `Updated ${formatWhen(memory.updatedAt)}`,
      `About ${Number(memory.approximateStoredTokens || 0).toLocaleString()} tokens stored`,
      `The AI reads up to ${Number(memory.maxContextChars || 0).toLocaleString()} characters of them per request`
    ].join(" · ") + (categories ? `. ${categories}.` : ".");
  }

  async function api(route, body = {}) {
    const response = await fetch(`/api/memory/synapse${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    return value;
  }

  async function run(action) {
    try {
      await action();
      $("synapseMemoryStatus").textContent = "Saved locally.";
    } catch (error) {
      $("synapseMemoryStatus").textContent = error.message;
    }
  }

  function reset() {
    $("synapseMemoryEntryId").value = "";
    $("synapseMemoryText").value = "";
    $("synapseMemoryTags").value = "";
    $("synapseMemoryImportance").value = 90;
    $("synapseMemoryExpiry").value = "";
    $("synapseMemorySensitive").checked = false;
  }

  function render() {
    const query = $("synapseMemoryFilter").value.toLowerCase();
    const list = $("synapseMemoryEntries");
    list.replaceChildren();
    const shown = sortEntries(state.entries.filter((item) => `${item.text} ${item.category} ${labelCase(item.category)} ${item.tags.join(" ")}`.toLowerCase().includes(query)), $("synapseMemorySort").value);
    $("synapseMemoryCount").textContent = shown.length === state.entries.length ? `${shown.length} ${shown.length === 1 ? "Memory" : "Memories"}` : `${shown.length} of ${state.entries.length}`;
    if (!shown.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = state.entries.length ? "No memories match the filter." : "No memories yet. Add one below or import a summary.";
      list.append(empty);
    }
    for (const entry of shown) {
      const card = document.createElement("article");
      card.className = "synapseMemoryEntry";
      const heading = document.createElement("strong");
      heading.textContent = labelCase(entry.category) + (entry.sensitive ? " · Local-Only" : "");
      const text = document.createElement("p");
      text.textContent = entry.text;
      const meta = document.createElement("small");
      meta.textContent = [sourceLabel(entry.source), `Importance ${entry.importance}`, `Updated ${formatWhen(entry.updatedAt)}`, entry.expiresAt ? `Expires ${formatWhen(entry.expiresAt)}` : ""].filter(Boolean).join(" · ");
      card.append(heading, text);
      let more = null;
      if (String(entry.text).length > LONG_TEXT) {
        text.classList.add("isClamped");
        more = document.createElement("button");
        more.type = "button";
        more.className = "synapseMemoryMore";
        more.textContent = "Show More";
        more.setAttribute("aria-expanded", "false");
        more.addEventListener("click", () => {
          const open = text.classList.toggle("isClamped") === false;
          more.textContent = open ? "Show Less" : "Show More";
          more.setAttribute("aria-expanded", String(open));
        });
      }
      const actions = document.createElement("div");
      actions.className = "synapseMemoryEntryActions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        $("synapseMemoryEntryId").value = entry.id;
        $("synapseMemoryCategory").value = entry.category;
        $("synapseMemoryText").value = entry.text;
        $("synapseMemoryTags").value = entry.tags.join(", ");
        $("synapseMemoryImportance").value = entry.importance;
        $("synapseMemoryExpiry").value = entry.expiresAt ? entry.expiresAt.slice(0, 16) : "";
        $("synapseMemorySensitive").checked = entry.sensitive;
        const editFold = document.querySelector('[data-fold-key="synapseMemory.edit"]');
        if (editFold?.getAttribute("aria-expanded") === "false") editFold.click();
        $("synapseMemoryText").focus();
      });
      const forget = document.createElement("button");
      forget.type = "button";
      forget.textContent = "Forget";
      forget.addEventListener("click", () => run(async () => { await api("/forget", { id: entry.id }); await load(); }));
      actions.append(...(more ? [more] : []), edit, forget);
      card.append(meta, actions);
      list.append(card);
    }
  }

  async function load() {
    state = await api("");
    $("synapseMemoryStats").textContent = statsText(state);
    const select = $("synapseMemoryCategory");
    if (!select.options.length) {
      for (const item of state.categories) select.append(Object.assign(document.createElement("option"), { value: item.category, textContent: labelCase(item.category) }));
    }
    render();
  }

  $("synapseMemoryFilter").addEventListener("input", () => state && render());
  window.RabbitHoleViewControls?.bindSort($("synapseMemorySort"), "rabbitHole.sort.synapseMemory", () => state && render());
  $("synapseMemoryNew").addEventListener("click", reset);
  $("synapseMemoryFile").addEventListener("change", () => run(async () => { $("synapseMemoryImportText").value = await $("synapseMemoryFile").files[0].text(); }));
  $("synapseMemoryImport").addEventListener("click", () => run(async () => { await api("/import", { content: $("synapseMemoryImportText").value }); await load(); }));
  $("synapseMemorySave").addEventListener("click", () => run(async () => {
    await api("/save", {
      ...($("synapseMemoryEntryId").value ? { id: $("synapseMemoryEntryId").value } : {}),
      text: $("synapseMemoryText").value,
      category: $("synapseMemoryCategory").value,
      tags: $("synapseMemoryTags").value.split(",").map((tag) => tag.trim()).filter(Boolean),
      importance: Number($("synapseMemoryImportance").value),
      expiresAt: $("synapseMemoryExpiry").value ? new Date($("synapseMemoryExpiry").value).toISOString() : null,
      sensitive: $("synapseMemorySensitive").checked,
      source: "explicit_user"
    });
    reset();
    await load();
  }));
  $("synapseMemoryExport").addEventListener("click", () => run(async () => {
    const fresh = await api("");
    const blob = new Blob([JSON.stringify({ version: 1, entries: fresh.entries }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: "rabbit-hole-memory.json" });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }));

  window.RabbitHoleSynapseMemory = {
    labelCase, sourceLabel, formatWhen, sortEntries, statsText,
    show() {
      if (loaded) return;
      loaded = true;
      load().catch((error) => { loaded = false; $("synapseMemoryStatus").textContent = error.message; });
    }
  };
})();
