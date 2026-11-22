# Deep Roon MCP integration

Rabbit Hole can read your Roon library through a
[Deep Roon MCP](https://github.com/renebouwmeester/deep-roon-mcp) server. It is optional:
without it, everything else works and the **Playback > Library** tab shows "The Roon Library
tab needs Deep Roon MCP: set DEEP_ROON_URL."

![Playback > Library with the Library list open: All Libraries, Music Library, Hi-Res, Vinyl Rips, Live Recordings and TIDAL with their album counts, beside the search box, Genre, Decade, Stars and Sort, the Favorites, Unplayed 90 Days, Added Last 30 Days and Unidentified toggles, and album cards with Play, Play Next, Queue and Start Radio](screenshots/roon-library-storage.png)

*The Library list drawn open for the screenshot (in the app it is a normal drop-down). Made-up
locations, albums and counts.*

## What it powers

| Feature | Uses Deep Roon |
| --- | --- |
| Playback > Library: albums, search, paging | Yes (`roon_library`) |
| Library, Genre, Decade and Stars lists, with Roon's counts | Yes (`roon_focus`) |
| Album details | Yes (`roon_album`) |
| Play, Play Next, Queue and Start Radio from the Library | Finds the album with `roon_album`, then plays it through **Rabbit Hole's own Roon extension** on the selected zone |
| Covers on the Library page | Served through Rabbit Hole |
| Now Playing, zones, transport, volume, the rest of the app | No |

The Library list names each of Roon's storage locations (your music folders, a Hi-Res share,
the TIDAL library and so on). That needs Deep Roon's storage-location change,
[deep-roon-mcp#6](https://github.com/renebouwmeester/deep-roon-mcp/pull/6); without it the
list shows only Local and TIDAL.

## Read only, by design

Rabbit Hole only calls Deep Roon's read tools: `roon_library`, `roon_focus`, `roon_search`,
`roon_album`, `roon_review`, `roon_versions`, `roon_top`, `roon_history`, `roon_similar`,
`roon_daily_picks`, `roon_new_for_you`, `roon_track_files` and `roon_status`
(`READ_TOOLS` in `src/deepRoonClient.js`). Any other tool is refused inside Rabbit Hole before
a request is sent, so Deep Roon's playback, queue, playlist, tag and settings tools are never
used. Starting music stays with Rabbit Hole's own Roon extension. Playing an album finds it in
Roon by its exact title and artist; when two albums share both, Rabbit Hole says so instead of
guessing. Starting an album or radio pauses a playing Lyrion player first.

## Set it up

1. Install and run Deep Roon MCP by following
   [its README](https://github.com/renebouwmeester/deep-roon-mcp), including connecting it to
   your Roon Core. It can run on any machine that Rabbit Hole can reach on your network.
2. Point Rabbit Hole at its MCP endpoint in `.env`, or in the Unraid template's
   **Deep Roon MCP URL** field (under Show more settings):

   ```sh
   DEEP_ROON_URL=http://192.168.1.22:9301/mcp
   ```

3. Restart Rabbit Hole and open **Playback > Library**.

Leave `DEEP_ROON_URL` empty to turn the Library tab off.

## When it is not reachable

- Each call has a 20-second timeout. If Deep Roon does not answer, the Library tab shows
  "Deep Roon MCP did not answer" and the rest of Rabbit Hole carries on.
- If Deep Roon restarts and forgets the session, Rabbit Hole opens a new one and retries once.
- Covers come from the image server Deep Roon reports. Rabbit Hole fetches them itself, accepts
  only JPEG or PNG under 10 MB, and serves them from `/api/roon-library/image/…`, so the
  browser never talks to the Roon Core directly.

**Security:** Deep Roon and Rabbit Hole have no login. Keep both on a trusted LAN.
