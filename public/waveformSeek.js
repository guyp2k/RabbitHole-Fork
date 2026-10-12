"use strict";
(() => {
  const BAR = 2, GAP = 2;

  function bars(peaks, count) {
    if (!Array.isArray(peaks) || !peaks.length || count < 1) return null;
    const out = [];
    for (let i = 0; i < count; i++) {
      const from = Math.floor((i / count) * peaks.length), to = Math.max(from + 1, Math.floor(((i + 1) / count) * peaks.length));
      let high = 0;
      for (let j = from; j < to && j < peaks.length; j++) high = Math.max(high, Number(peaks[j]) || 0);
      out.push(high);
    }
    return out;
  }

  function attach(input) {
    const wrap = document.createElement("div"), canvas = document.createElement("canvas");
    wrap.className = "waveformSeek"; canvas.className = "waveformCanvas"; canvas.setAttribute("aria-hidden", "true");
    input.before(wrap); wrap.append(canvas, input);
    let peaks = null, drawn = "";
    function draw() {
      const max = Number(input.max) || 0, value = Number(input.value) || 0;
      const seekable = max > 0;
      wrap.classList.toggle("isIdle", !seekable);
      wrap.classList.toggle("hasPeaks", !!peaks);
      const width = canvas.clientWidth, height = canvas.clientHeight, ratio = window.devicePixelRatio || 1;
      const key = [width, height, ratio, seekable, max, value, peaks ? peaks.length : 0].join("|");
      if (key === drawn || !width || !height) return;
      drawn = key;
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
      if (!seekable) return;
      const style = getComputedStyle(wrap);
      const played = style.getPropertyValue("--waveform-played").trim(), rest = style.getPropertyValue("--waveform-rest").trim(), head = style.getPropertyValue("--waveform-head").trim();
      const count = Math.max(1, Math.floor((width + GAP) / (BAR + GAP))), levels = bars(peaks, count), split = (value / max) * width;
      for (let i = 0; i < count; i++) {
        const x = i * (BAR + GAP);
        const level = levels ? Math.max(0.06, levels[i]) : 0;
        const h = levels ? Math.max(2, level * height) : 2;
        ctx.fillStyle = x + BAR / 2 <= split ? played : rest;
        ctx.fillRect(x, (height - h) / 2, BAR, h);
      }
      ctx.fillStyle = head; ctx.fillRect(Math.min(width - 2, Math.max(0, split - 1)), 0, 2, height);
    }
    input.addEventListener("input", draw);
    new ResizeObserver(draw).observe(wrap);
    setInterval(draw, 250);
    return { setPeaks(next) { peaks = Array.isArray(next) && next.length ? next : null; drawn = ""; draw(); } };
  }

  async function load(url, key, current, target) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = response.ok ? await response.json() : null;
      if (current() === key) target.setPeaks(data?.peaks || null);
    } catch { if (current() === key) target.setPeaks(null); }
  }

  const roonSlider = document.getElementById("seekSlider");
  if (roonSlider) {
    const roon = attach(roonSlider);
    let roonKey = "";
    setInterval(() => {
      const zone = typeof activeZone === "function" ? activeZone() : null;
      const lines = zone?.now_playing?.three_line || {};
      const key = zone && lines.line1 ? JSON.stringify([zone.zone_id, lines.line1, lines.line2, lines.line3, zone.now_playing.length]) : "";
      if (key === roonKey) return;
      roonKey = key; roon.setPeaks(null);
      if (key) void load(`/api/roon/waveform?zone_id=${encodeURIComponent(zone.zone_id)}`, key, () => roonKey, roon);
    }, 1000);
  }

  const lyrionSlider = document.getElementById("lyrionProgress"), stage = document.getElementById("lyrionNow");
  if (lyrionSlider && stage) {
    const lyrion = attach(lyrionSlider);
    let lyrionKey = "";
    stage.addEventListener("lyrion-track", event => {
      const track = event.detail;
      const key = track ? JSON.stringify([track.id, track.url, track.title]) : "";
      if (key === lyrionKey) return;
      lyrionKey = key; lyrion.setPeaks(null);
      if (track?.source === "Local" && /^\d+$/.test(String(track.id || ""))) void load(`/api/lyrion/waveform?trackId=${encodeURIComponent(track.id)}`, key, () => lyrionKey, lyrion);
    });
  }
})();
