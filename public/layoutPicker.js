"use strict";

(function () {
  const LAYOUTS = ["classic", "modern"];
  const saved = (/(?:^|;\s*)rh_layout=([a-z]+)(?:;|$)/.exec(document.cookie) || [])[1];
  const layout = LAYOUTS.includes(saved) ? saved : "classic";
  if (layout === "modern") document.body.classList.add("layoutModern");

  document.addEventListener("DOMContentLoaded", () => {
    const select = document.getElementById("layoutSelect");
    if (!select) return;
    select.value = layout;
    select.addEventListener("change", () => {
      document.cookie = `rh_layout=${LAYOUTS.includes(select.value) ? select.value : "classic"}; path=/; max-age=31536000; samesite=lax`;
      location.reload();
    });
  });
})();
