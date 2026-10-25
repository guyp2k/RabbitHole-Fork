"use strict";
(() => {
  const ICONS = {
    previous: '<path d="M6 5h2v14H6zM20 5v14L9 12z"/>',
    play: '<path d="M7 5v14l11-7z"/>',
    pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    stop: '<path d="M6 6h12v12H6z"/>',
    next: '<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>',
    muted: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2"/>',
    unmuted: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2"/>'
  };
  const icon = (name, size) => `<svg class="transportIcon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICONS[name]}</svg>`;
  const STATE_LABELS = { playing: "Playing", paused: "Paused", stopped: "Stopped", loading: "Loading" };

  function clock(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), secs = total % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}` : `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function playerCardView(card) {
    const duration = Math.max(0, Number(card?.duration) || 0);
    const position = Math.min(Math.max(0, Number(card?.position) || 0), duration || Infinity);
    const volume = card?.volume || null;
    const level = volume && volume.value !== undefined && volume.value !== null ? Number(volume.value) : null;
    return {
      stateLabel: STATE_LABELS[card?.state] || "",
      roomLine: [card?.system, card?.room].filter(Boolean).join(" · "),
      title: card?.title || "Nothing playing",
      artist: card?.artist || "",
      album: card?.album || "",
      art: card?.art || "",
      playing: card?.state === "playing",
      seekable: !!card?.canSeek && duration > 0,
      seekMax: duration || 1,
      seekValue: duration ? Math.floor(position) : 0,
      elapsed: duration ? clock(position) : "",
      remaining: duration ? `-${clock(duration - position)}` : "",
      volumeShown: !!volume,
      sliderShown: level !== null,
      volumeMin: volume?.min ?? 0,
      volumeMax: volume?.max ?? 100,
      volumeStep: volume?.step ?? 1,
      volumeValue: level,
      volumeText: level === null ? "" : `${level}${volume.type === "db" ? " dB" : ""}`,
      muted: !!volume?.muted,
      canMute: !!volume?.canMute
    };
  }

  function playerCardFromLyrion(status) {
    const now = status?.nowPlaying || null;
    const volume = status?.volume || null;
    return {
      system: "Lyrion",
      room: status?.playerName || "",
      state: status?.connected === false ? "stopped" : status?.state || "stopped",
      title: now?.title || "",
      artist: now?.artist || "",
      album: now?.album || "",
      art: now?.artwork || "",
      position: status?.position || 0,
      duration: status?.duration || 0,
      canSeek: !!status?.canSeek,
      volume: volume ? { value: volume.value, min: volume.min, max: volume.max, step: volume.step, type: volume.type, muted: !!volume.is_muted, canMute: true } : null
    };
  }

  function createPlayerCard() {
    const dialog = document.createElement("dialog");
    dialog.className = "playerCard";
    dialog.innerHTML = `<div class="playerCardBox">
      <button type="button" class="playerCardClose" aria-label="Close">✕</button>
      <img class="playerCardArt" alt="" hidden>
      <p class="playerCardState"></p><p class="playerCardRoom"></p>
      <h2 class="playerCardTitle"></h2><p class="playerCardArtist"></p><p class="playerCardAlbum"></p>
      <div class="playerCardSeek"><input type="range" min="0" max="1" step="1" value="0" aria-label="Playback position">
        <div class="playerCardTimes"><span class="playerCardElapsed"></span><span class="playerCardRemaining"></span></div></div>
      <div class="playerCardControls">
        <button type="button" class="transportButton" data-card-control="previous" title="Previous" aria-label="Previous">${icon("previous", 22)}</button>
        <button type="button" class="transportButton transportButton--main" data-card-control="playpause" title="Play or pause" aria-label="Play or pause"></button>
        <button type="button" class="transportButton transportButton--minor" data-card-control="stop" title="Stop" aria-label="Stop">${icon("stop", 18)}</button>
        <button type="button" class="transportButton" data-card-control="next" title="Next" aria-label="Next">${icon("next", 22)}</button>
      </div>
      <div class="playerCardVolume"><button type="button" class="playerCardMute"></button>
        <input type="range" aria-label="Volume"><output class="playerCardLevel"></output></div>
      <p class="playerCardError" role="status" aria-live="polite" hidden></p>
    </div>`;
    document.body.append(dialog);
    const $ = (selector) => dialog.querySelector(selector);
    const seek = $(".playerCardSeek input"), level = $(".playerCardVolume input"), playButton = $("[data-card-control=playpause]"), muteButton = $(".playerCardMute");
    let adapter = null, id = "", timer = null, generation = 0, seekHeld = false, levelHeld = false, last = null;

    function render(card) {
      last = card;
      const view = playerCardView(card);
      const art = $(".playerCardArt");
      if (view.art && art.getAttribute("src") !== view.art) art.src = view.art;
      art.hidden = !view.art;
      $(".playerCardState").textContent = view.stateLabel;
      $(".playerCardRoom").textContent = view.roomLine;
      $(".playerCardTitle").textContent = view.title;
      $(".playerCardArtist").textContent = view.artist;
      $(".playerCardAlbum").textContent = view.album;
      seek.max = String(view.seekMax);
      seek.disabled = !view.seekable;
      if (!seekHeld) {
        seek.value = String(view.seekValue);
        $(".playerCardElapsed").textContent = view.elapsed;
        $(".playerCardRemaining").textContent = view.remaining;
      }
      playButton.innerHTML = icon(view.playing ? "pause" : "play", 28);
      playButton.setAttribute("aria-label", view.playing ? "Pause" : "Play");
      $(".playerCardVolume").hidden = !view.volumeShown;
      level.hidden = $(".playerCardLevel").hidden = !view.sliderShown;
      if (view.sliderShown && !levelHeld) {
        level.min = String(view.volumeMin); level.max = String(view.volumeMax); level.step = String(view.volumeStep);
        level.value = String(view.volumeValue);
        $(".playerCardLevel").textContent = view.volumeText;
      }
      muteButton.hidden = !view.canMute;
      muteButton.innerHTML = icon(view.muted ? "muted" : "unmuted", 18);
      muteButton.setAttribute("aria-label", view.muted ? "Unmute" : "Mute");
      muteButton.setAttribute("aria-pressed", String(view.muted));
      dialog.setAttribute("aria-label", `${view.roomLine || "Player"} controls`);
    }

    function fail(error) {
      const box = $(".playerCardError");
      box.textContent = error?.message || String(error);
      box.hidden = false;
    }

    async function refresh() {
      if (!adapter) return;
      const mine = generation;
      try {
        const card = await adapter.load(id);
        if (mine !== generation || !dialog.open) return;
        $(".playerCardError").hidden = true;
        render(card);
      } catch (error) {
        if (mine === generation) fail(error);
      }
    }

    async function act(work) {
      try {
        await work();
        await refresh();
      } catch (error) {
        fail(error);
      }
    }

    function close() {
      generation++;
      clearInterval(timer);
      timer = null;
      adapter = null;
      if (dialog.open) dialog.close();
    }

    dialog.addEventListener("close", () => { generation++; clearInterval(timer); timer = null; adapter = null; });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    $(".playerCardClose").addEventListener("click", close);
    for (const button of dialog.querySelectorAll("[data-card-control]")) {
      button.addEventListener("click", () => act(() => adapter.control(id, button.dataset.cardControl)));
    }
    seek.addEventListener("pointerdown", () => { seekHeld = true; });
    seek.addEventListener("input", () => {
      seekHeld = true;
      const duration = Number(seek.max) || 0;
      $(".playerCardElapsed").textContent = clock(seek.value);
      $(".playerCardRemaining").textContent = `-${clock(duration - Number(seek.value))}`;
    });
    seek.addEventListener("change", () => act(async () => { try { await adapter.seek(id, Number(seek.value)); } finally { seekHeld = false; } }));
    level.addEventListener("pointerdown", () => { levelHeld = true; });
    level.addEventListener("input", () => { levelHeld = true; $(".playerCardLevel").textContent = level.value; });
    level.addEventListener("change", () => act(async () => { try { await adapter.volume(id, Number(level.value)); } finally { levelHeld = false; } }));
    muteButton.addEventListener("click", () => act(() => adapter.mute(id, !last?.volume?.muted)));

    return {
      open(nextAdapter, nextId) {
        generation++;
        adapter = nextAdapter;
        id = nextId;
        last = null;
        seekHeld = levelHeld = false;
        $(".playerCardError").hidden = true;
        render({ state: "loading", system: nextAdapter.system, room: nextAdapter.name?.(nextId) || "" });
        if (!dialog.open) dialog.showModal();
        clearInterval(timer);
        timer = setInterval(refresh, nextAdapter.refreshMs || 1000);
        return refresh();
      },
      close,
      get openFor() { return dialog.open ? id : ""; }
    };
  }

  function makePlayerCardTrigger(element, openCurrent) {
    if (!element) return;
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", "Open player controls");
    element.title = "Player controls";
    element.classList.add("playerCardTrigger");
    element.addEventListener("click", () => openCurrent());
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openCurrent();
    });
  }

  let shared = null;
  window.makePlayerCardTrigger = makePlayerCardTrigger;
  window.playerCardView = playerCardView;
  window.playerCardFromLyrion = playerCardFromLyrion;
  window.openPlayerCard = (adapter, id) => {
    shared ||= createPlayerCard();
    return shared.open(adapter, id);
  };
})();
