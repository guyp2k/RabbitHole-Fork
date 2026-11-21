"use strict";

const ACTIONS = new Set(["play", "next", "queue", "radio"]);
const SORTS = new Set(["artist", "added", "released", "most_played", "title", "popular", "random"]);
const IMAGE_ID = /^[a-z0-9]{4,40}$/;
const PAGE = 60;

function filtersFrom(params) {
  const args = {};
  const text = (name) => { const value = String(params.get(name) || "").trim(); if (value) args[name] = value.slice(0, 120); };
  const bool = (name) => { const value = params.get(name); if (value === "true" || value === "false") args[name] = value === "true"; };
  const int = (name, min, max) => { const value = Number(params.get(name)); if (params.has(name) && Number.isInteger(value) && value >= min && value <= max) args[name] = value; };
  text("genre"); text("artist"); text("label"); text("text");
  const decade = Number(params.get("decade"));
  if (params.has("decade") && Number.isInteger(decade) && decade % 10 === 0 && decade >= 1900 && decade <= 2090) { args.year_from = decade; args.year_to = decade + 9; }
  const stars = Number(params.get("min_stars"));
  if (params.has("min_stars") && stars >= 0.5 && stars <= 5 && stars * 2 === Math.round(stars * 2)) args.min_stars = stars;
  bool("hires"); bool("identified"); bool("favorites"); bool("live"); bool("compilation");
  int("not_played_within_days", 1, 36500); int("played_within_days", 1, 36500); int("added_within_days", 1, 36500);
  return args;
}

function createRoonLibraryApi({ deepRoon, roon, readJson, sendJson, fetchImpl = fetch }) {
  let imageOrigin = "";

  const learnImage = (url) => {
    try {
      const parsed = new URL(String(url || ""));
      const id = parsed.pathname.match(/^\/image\/([a-z0-9]+)\.jpg$/)?.[1];
      if (parsed.protocol !== "http:" || !id || !IMAGE_ID.test(id)) return "";
      if (!imageOrigin) imageOrigin = parsed.origin;
      return parsed.origin === imageOrigin ? `/api/roon-library/image/${id}` : "";
    } catch { return ""; }
  };
  const album = (row = {}) => ({ key: String(row.key || ""), title: row.title || "", artist: row.artist || "", year: row.year || null,
    format: row.format || "", stars: row.stars ?? null, image: learnImage(row.image_url) });

  async function image(res, id) {
    if (!imageOrigin || !IMAGE_ID.test(id)) return sendJson(res, 404, { error: "Cover unavailable" });
    const response = await fetchImpl(`${imageOrigin}/image/${id}.jpg`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return sendJson(res, 404, { error: "Cover unavailable" });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 10 * 1024 * 1024) return sendJson(res, 404, { error: "Cover too large" });
    const type = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ? "image/jpeg"
      : bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png" : "";
    if (!type) return sendJson(res, 404, { error: "Cover unavailable" });
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" });
    return res.end(bytes);
  }

  async function handle(req, res, url) {
    const route = url.pathname.slice("/api/roon-library/".length);
    try {
      if (req.method === "GET" && route.startsWith("image/")) return await image(res, decodeURIComponent(route.slice(6)));
      if (!deepRoon.enabled) return sendJson(res, 503, { error: "The Roon Library tab needs Deep Roon MCP: set DEEP_ROON_URL." });
      if (req.method === "GET" && route === "albums") {
        const params = url.searchParams;
        const args = filtersFrom(params);
        const sort = String(params.get("sort") || "");
        if (SORTS.has(sort)) args.sort = sort;
        if (params.get("ascending") === "true") args.ascending = true;
        const offset = Number(params.get("offset"));
        if (Number.isInteger(offset) && offset > 0) args.offset = offset;
        args.limit = PAGE;
        const result = await deepRoon.call("roon_library", args);
        return sendJson(res, 200, { total: result.total ?? 0, offset: result.offset ?? args.offset ?? 0, limit: PAGE, albums: (result.rows || []).map(album) });
      }
      if (req.method === "GET" && route === "focus") {
        const result = await deepRoon.call("roon_focus", filtersFrom(url.searchParams));
        return sendJson(res, 200, { totalAlbums: result.total_albums ?? 0, genres: result.genres || [], decades: result.decades || [], stars: result.stars || [] });
      }
      if (req.method === "GET" && /^album\/\d+$/.test(route)) {
        const result = await deepRoon.call("roon_album", { key: route.slice(6) });
        return sendJson(res, 200, { album: album(result.album), artists: (result.artists || []).map((a) => a.name).filter(Boolean),
          length: result.length || "", discs: result.discs || 1, identified: result.identified !== false,
          tracks: (result.tracks || []).map((t) => ({ title: t.title || "", length: t.length || "", disc: t.disc || null })) });
      }
      if (req.method === "POST" && route === "play") {
        const body = await readJson(req);
        const action = String(body.action || "");
        const key = String(body.key || "");
        if (!ACTIONS.has(action) || !/^\d+$/.test(key) || !body.zoneId) return sendJson(res, 400, { error: "Send an album key, a Roon zone and one of play, next, queue or radio." });
        const found = await deepRoon.call("roon_album", { key });
        const title = found.album?.title || "";
        const artists = [...new Set([found.album?.artist, ...(found.artists || []).map((a) => a.name)].filter(Boolean))];
        const result = await roon.playLibraryAlbum({ title, artists }, String(body.zoneId), action);
        return result.success ? sendJson(res, 200, result) : sendJson(res, 409, { error: result.reason || "Roon did not play the album." });
      }
      return sendJson(res, 404, { error: "Unknown Roon Library endpoint." });
    } catch (error) {
      return sendJson(res, error.statusCode || 502, { error: error.message });
    }
  }

  return { handle };
}

module.exports = { createRoonLibraryApi, filtersFrom };
