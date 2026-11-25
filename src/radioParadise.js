"use strict";

const API = "https://api.radioparadise.com/api";
const COVER = /^https:\/\/img\.radioparadise\.com\/covers\/[lms]\/\d+\.jpg$/;
const CHANNELS_MS = 24 * 60 * 60 * 1000;
const NOW_MS = 20 * 1000;

function isRadioParadiseZone(zone = {}) {
  const now = zone.now_playing || {};
  return /^radio paradise\b/i.test(String(now.two_line?.line1 || now.three_line?.line1 || "").trim());
}

function createRadioParadise({ fetchJsonWithTimeout, matches, clock = Date.now, timeoutMs = 4000 }) {
  let channels = null;
  const nowCache = new Map();
  const get = (path) => fetchJsonWithTimeout(`${API}/${path}`, { headers: { accept: "application/json" } }, timeoutMs);

  async function channelList() {
    if (channels && clock() - channels.at < CHANNELS_MS) return channels.list;
    const { response, body } = await get("list_chan?C_user_id=1&ver=2");
    const list = response.ok && Array.isArray(body) ? body.map((channel) => String(channel?.chan ?? "")).filter((chan) => /^\d+$/.test(chan)) : [];
    if (list.length) channels = { at: clock(), list };
    return list;
  }

  async function nowOn(chan) {
    const cached = nowCache.get(chan);
    if (cached && clock() - cached.at < NOW_MS) return cached.value;
    let value = null;
    try {
      const { response, body } = await get(`now_playing?chan=${chan}`);
      if (response.ok && body && typeof body === "object") value = body;
    } catch {
      value = null;
    }
    nowCache.set(chan, { at: clock(), value });
    return value;
  }

  async function lookup(track = {}) {
    let list = [];
    try { list = await channelList(); } catch { return null; }
    const playing = await Promise.all(list.map(nowOn));
    const hit = playing.find((song) => song && COVER.test(String(song.cover || "")) && matches(track, { artist: song.artist, title: song.title }));
    return hit ? { artist: hit.artist, title: hit.title, album: hit.album || "", albumArtUrl: hit.cover, source: "paradise" } : null;
  }

  return { lookup };
}

module.exports = { createRadioParadise, isRadioParadiseZone };
