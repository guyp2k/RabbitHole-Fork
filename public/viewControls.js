"use strict";
(() => {
  const LAYOUTS = [["cards", "Thumbnails"], ["list", "List"]];

  function readLayout(key, fallback = "cards") {
    try {
      const saved = localStorage.getItem(key);
      return saved === "list" || saved === "cards" ? saved : fallback;
    } catch {
      return fallback;
    }
  }

  function bindSort(select, key, onChange) {
    const allowed = [...select.options].map((option) => option.value);
    let saved = null;
    try { saved = localStorage.getItem(key); } catch {}
    select.value = allowed.includes(saved) ? saved : allowed[0];
    select.addEventListener("change", () => {
      try { localStorage.setItem(key, select.value); } catch {}
      onChange(select.value);
    });
    return select.value;
  }

  function layoutSwitch({ key, name, onChange, defaultLayout = "cards" }) {
    let layout = readLayout(key, defaultLayout);
    const group = document.createElement("div");
    group.className = "viewSwitch";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", `${name} View`);
    const buttons = LAYOUTS.map(([value, text]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.layout = value;
      button.textContent = text;
      group.append(button);
      return button;
    });
    const sync = () => { for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.layout === layout)); };
    for (const button of buttons) button.addEventListener("click", () => {
      layout = button.dataset.layout;
      try { localStorage.setItem(key, layout); } catch {}
      sync();
      onChange(layout);
    });
    sync();
    onChange(layout);
    return group;
  }

  function bindFolds() {
    if (typeof document.querySelectorAll !== "function") return;
    for (const button of document.querySelectorAll("[data-fold-key]")) {
      const target = document.getElementById(button.getAttribute("aria-controls"));
      if (!target) continue;
      const key = `rabbitHole.fold.${button.dataset.foldKey}`;
      let folded = false;
      try { folded = localStorage.getItem(key) === "1"; } catch {}
      const apply = () => {
        target.hidden = folded;
        button.setAttribute("aria-expanded", String(!folded));
        const caret = button.querySelector(".panelFoldCaret");
        if (caret) caret.textContent = folded ? "▸" : "▾";
      };
      button.addEventListener("click", () => {
        folded = !folded;
        try { localStorage.setItem(key, folded ? "1" : "0"); } catch {}
        apply();
      });
      apply();
    }
  }

  window.RabbitHoleViewControls = { readLayout, layoutSwitch, bindSort, bindFolds };
  bindFolds();
})();
