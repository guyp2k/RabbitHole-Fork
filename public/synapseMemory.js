"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  if (!$("synapseMemoryView")) return;
  let state = null;
  let loaded = false;

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
    for (const entry of state.entries.filter((item) => `${item.text} ${item.category} ${item.tags.join(" ")}`.toLowerCase().includes(query))) {
      const card = document.createElement("article");
      card.className = "synapseMemoryEntry";
      const heading = document.createElement("strong");
      heading.textContent = entry.category + (entry.sensitive ? " · Local-Only" : "");
      const text = document.createElement("p");
      text.textContent = entry.text;
      const meta = document.createElement("small");
      meta.textContent = `${entry.id} · ${entry.source} · Updated ${entry.updatedAt}`;
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
        $("synapseMemoryText").focus();
      });
      const forget = document.createElement("button");
      forget.type = "button";
      forget.textContent = "Forget";
      forget.addEventListener("click", () => run(async () => { await api("/forget", { id: entry.id }); await load(); }));
      actions.append(edit, forget);
      card.append(heading, text, meta, actions);
      list.append(card);
    }
  }

  async function load() {
    state = await api("");
    const categories = state.categories.map((item) => `${item.category} ${item.count}`).join(", ");
    $("synapseMemoryStats").textContent = `${state.count} entries · Updated ${state.updatedAt || "never"} · ~${state.approximateStoredTokens} stored tokens · retrieved context capped at ${state.maxContextChars} characters. Categories: ${categories}`;
    const select = $("synapseMemoryCategory");
    if (!select.options.length) {
      for (const item of state.categories) select.append(Object.assign(document.createElement("option"), { value: item.category, textContent: item.category }));
    }
    render();
  }

  $("synapseMemoryFilter").addEventListener("input", () => state && render());
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
    show() {
      if (loaded) return;
      loaded = true;
      load().catch((error) => { loaded = false; $("synapseMemoryStatus").textContent = error.message; });
    }
  };
})();
