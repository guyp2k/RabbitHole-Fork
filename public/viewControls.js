"use strict";
(() => {
  const LAYOUTS = [["cards", "Thumbnails"], ["list", "List"]];

  function readLayout(key) {
    try { return localStorage.getItem(key) === "list" ? "list" : "cards"; } catch { return "cards"; }
  }

  function layoutSwitch({ key, name, onChange }) {
    let layout = readLayout(key);
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

  window.RabbitHoleViewControls = { readLayout, layoutSwitch };
})();
