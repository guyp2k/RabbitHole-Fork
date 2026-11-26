# What this fork adds: a tour

A walk through the interface changes this fork makes on top of
[darthspaders/RoonAI](https://github.com/darthspaders/RoonAI). Every screenshot
uses made-up tracks, rooms, players and addresses. The short list is in the
[README](../README.md#what-this-fork-changes); the full history is in the
commits after upstream `f0b1e81`.

- [Playback System row](#playback-system-row)
- [Now Playing](#now-playing)
- [Transport, Up next and the seek bar](#transport-up-next-and-the-seek-bar)
- [HQPlayer and the HQP host line](#hqplayer-and-the-hqp-host-line)
- [Player card](#player-card)
- [Roon Library](#roon-library)
- [Lyrion](#lyrion)
- [On a phone](#on-a-phone)
- [Modern layout](#modern-layout)
- [Themes](#themes)
- [Changes you cannot see](#changes-you-cannot-see)

## Playback System row

![Playback System row: Roon and Lyrion pills with a Rouen link, an HQPlayer row with Web Interface, HQPTuner and HQPweb links, and a Roon Zone row with one pill per zone, each with a small play button](screenshots/playback-system-row.png)

- **Roon / Lyrion** switches the whole page between the two players. The choice
  is kept in the browser.
- **Rouen**, **Web Interface**, **HQPTuner** and **HQPweb** are links, shown only when
  `ROUEN_URL`, `HQPLAYER_WEB_URL`, `HQPTUNER_URL` or `HQPWEB_URL` is set (the HQPlayer web
  interface is also found from the HQPlayerBridge plugin when Lyrion is in use).
- **Roon Zone** lists every zone as a pill instead of a drop-down. The ▸ on a
  pill opens that zone's [player card](#player-card).

## Now Playing

![Roon Now Playing: track details, volume and system status on the left, album art in the centre with the playback lines, Up next, transport buttons and a waveform seek bar below it, rating and playlist tools on the right](screenshots/roon-now-playing.png)

Roon and Lyrion share one three-column layout:

- **Left:** track length, release date, label and the source format (for
  example `FLAC · 44.1 kHz / 16-bit · 880 kbps`, with where it came from), a
  volume control, and a System block with CPU and GPU temperatures and the
  connection state of Roon or Lyrion, the language model and MCP.
- **Centre:** the album art, the playback chain under it (`Roon → HQPlayer ·
  playing`), rating stars, Up next, the transport and the seek bar.
- **Right:** rating buttons, actions and playlist tools.

![Left column close up: track details, the volume slider with minus and plus buttons, and the System block with CPU 52C, GPU 44C and green and amber status dots](screenshots/system-panel.png)

Temperature chips and the Visualizer toggle are hidden when they cannot work,
instead of showing empty values.

## Transport, Up next and the seek bar

Under the art, on both players:

- **Up next** names the next track, how many are queued and the time left.
- **Round icon buttons** for back, play/pause, stop and next.
- **A short seek bar.** When the track is a file in the Lyrion library (on
  either player), it is drawn as the track's waveform, read from the file with
  FFmpeg. Click or drag to seek; the red mark is the position.

## HQPlayer and the HQP host line

For a Roon zone that plays through HQPlayer (`ROON_HQPLAYER_ZONES`) or the
Lyrion HQPlayerBridge player, the line under the playback chain shows what
HQPlayer is doing: output rate, mode, filter and modulator.

If the HQPlayer machine runs the optional
[HQP host monitor](../integrations/hqp-host-monitor/README.md) and is listed in
`HQP_HOST_MONITORS`, an **HQP host** line follows it:

![HQP host line, healthy: 1.42x realtime and GPU 47°C in green, 34%, 31 W, 0.4 / 12 GB, and 0 clips in green](screenshots/hqp-host-line.png)

| Part | From | Colour |
|------|------|--------|
| `1.42x realtime` | HQPlayer's processing speed, shown only while playing | green from 1.1x, amber below 1.1x, red below 1.0x |
| `GPU 47°C` | the agent | green below 80 °C, amber from 80 °C, red from 90 °C |
| `34%`, `31 W`, `0.4 / 12 GB` | the agent: load, power, memory in use / total | |
| `0 clips` | HQPlayer's clip counter | green at 0, red above 0 |

Working hard, close to the limit:

![HQP host line under load: 1.04x realtime, GPU 83°C, 71%, 96 W and 3 clips, with the realtime and temperature highlighted as warnings and the clips as a fault](screenshots/hqp-host-line-warning.png)

When the agent does not answer, the line says so in grey and keeps HQPlayer's
own numbers. A missing value is left out, never shown as 0:

![HQP host line with the agent unreachable: 1.42x realtime, a grey "HQP Host: no data", and 0 clips](screenshots/hqp-host-line-nodata.png)

Zones and players that do not use a monitored HQPlayer show no host line at all.
When HQPlayer is stopped or paused, the realtime part is left out rather than
shown as a red 0.00x.

## Player card

The ▸ on any Roon zone or Lyrion player pill, or a tap on the album art, opens
that room's card: art, track, seek bar, back / play-pause / stop / next, and
volume with mute. It controls that room without switching the page to it.

<p>
  <img src="screenshots/player-card-desktop.png" alt="Player card on a desktop: a centred card over the blurred page with album art, the room, track, seek bar, transport buttons, a volume row with mute and a close button" width="560">
  <img src="screenshots/player-card-phone.png" alt="Player card on a phone: full screen with album art, the room, track, seek bar, transport buttons and a volume row with mute" width="220">
</p>

## Roon Library

![Playback > Library: a search box, Library, Genre, Decade, Stars and Sort drop-downs, Favorites, Unplayed 90 Days, Added Last 30 Days and Unidentified toggles, and album cards with Play, Play Next, Queue and Start Radio buttons](screenshots/roon-library.png)

**Playback > Library** browses the albums in your Roon library with Roon's own
Focus filters: library (each of Roon's storage locations, such as your music
folders and the TIDAL library, with its album count), genre and decade (with
Roon's counts), star rating, sort order, favorites, albums not played in 90 days, albums added in the last
30 days and albums Roon could not identify.

- **Play**, **Play Next**, **Queue** and **Start Radio** act on the selected
  Roon zone through Rabbit Hole's own Roon extension. The album is found in
  Roon's library by its exact title and artist; when two library albums share
  both, Rabbit Hole says so instead of guessing.
- Starting an album or radio pauses a playing Lyrion player first.
- Browsing needs a [Deep Roon MCP](https://github.com/renebouwmeester/deep-roon-mcp)
  server, set with `DEEP_ROON_URL`. Rabbit Hole only calls its read tools; any
  other tool is refused before a request is sent. Covers are served through
  Rabbit Hole. Setup, the full tool list and the storage-location list are in the
  [Deep Roon guide](deep-roon.md).

## Lyrion

Lyrion gets the same Now Playing as Roon, with what LMS knows about the file
(genre, track number, ReplayGain, file size, date added) and the player and
server under System:

![Lyrion Now Playing: player pills, track and file details, the System block with the Lyrion server, player, address and repeat and shuffle state, album art with the HQPlayer and HQP host lines, Up next, transport and seek bar, and rating, TIDAL and SoundCloud tools on the right](screenshots/lyrion-now-playing.png)

A **Home** tab with new music, favorites and explore tiles:

![Lyrion Home tab: a New Music row of six album tiles, a Favorites row of four, and Explore tiles for Albums, Artists, New Music and Favorites](screenshots/lyrion-home.png)

**Sources & Discovery** with foldable rows and the setup links moved into a
Setup menu:

![Lyrion Sources and Discovery: a folded Setup menu, a row of source pills, a search box with Search source and Search all sources, and Back and Browse source buttons](screenshots/lyrion-sources.png)

Lyrion tracks can be rated like Roon's, streamed tracks show their cover art,
and one unanswered Roon call no longer freezes the Lyrion controls.

## On a phone

The columns stack: details and System first, then the art and everything under
it.

<p>
  <img src="screenshots/phone-roon.png" alt="Roon Now Playing on a phone: Maximize Player and Full Window buttons, then track details, volume and System, then the album art" width="260">
  <img src="screenshots/phone-lyrion.png" alt="Lyrion Now Playing on a phone: player pills, the Lyrion tabs, a Fullscreen button, then track and file details, volume and System" width="260">
</p>

## Modern layout

**Settings > Layout > Modern** swaps the stacked top rows for a left menu: Listen,
Discover, You and System, with the Roon | Lyrion switch, Zone and Links at the bottom.
Classic stays the default, and the choice is saved per browser.

![Modern Roon Now Playing with the left menu, foldable panels, the file format under the album art and the HQPlayer signal chain along the bottom](screenshots/modern-roon.png)

- **Folding panels:** Now Playing, System, Rating, Actions and Playlists fold from
  their headings, on Roon and Lyrion. What you fold is remembered.
- **Under the album art:** the playback status, the file format for every zone
  (HQPlayer input, Library file or TIDAL catalogue) and the rating stars.
- **Signal chain:** for HQPlayer zones, Source, Roon (or Lyrion), HQPlayer and
  Output as pills, with the HQP host line under them. Lyrion shows them only while
  its HQPlayer player is playing.
- **Fits the window:** the cover sizes itself so the whole player, chain included,
  fits without scrolling, up to the old 660px cap on tall windows.
- **Album-art tint and motion:** the page is tinted from the cover's colours, and
  the cover, title and opened panels animate. Both stop when the system asks for
  reduced motion.

On a phone the top bar has two rows (Roon | Lyrion, Zone and Links, then the page
tabs). From 700 to 1099px wide (a foldable opened, a tablet in portrait) the player is
one column beside the menu. On both, the signal chain stacks into aligned rows.

<p>
  <img src="screenshots/modern-phone.png" alt="Modern layout on a phone: two-row top bar, then track details, album art, transport, volume, seek bar, the stacked signal chain and the panels" width="220">
  <img src="screenshots/modern-fold.png" alt="Modern layout at 840 pixels wide: the left menu beside a one-column player" width="300">
</p>

## Themes

Nine themes, picked in **Settings**. `UI_THEME` sets the default for new
browsers.

![The Library page in the nine themes: Mindshovel Colorful, Mindshovel Colorful Light, Mindshovel Dark, Mindshovel Light, Mindshovel Blue, Mindshovel Dark Orange, Obsidian & Copper, Graphite & Brass and Miyara](screenshots/themes.png)

The picker lists them named and ordered as in UCWEB: Mindshovel Colorful,
Mindshovel Colorful Light, Mindshovel Dark, Mindshovel Light, Mindshovel Blue,
Mindshovel Dark Orange, Obsidian & Copper, Graphite & Brass and Miyara.

Each theme is a JSON file in `src/themes/`;
[Colour themes](../README.md#colour-themes) in the README explains how to add one.

## Changes you cannot see

- **Discovery:** artist-led TIDAL searches are checked against the planned
  artists, results that only echo a bare descriptor and karaoke backing tracks
  are rejected, and Last.fm relatives of the searched artist are kept.
- **Lyrion and HQPlayer:** HQPlayer is found from the bridge plugin's address,
  not a loopback player address.
- **Unraid:** a published image (`ghcr.io/guyp2k/rabbithole-fork`) and an Unraid
  template; see [Install on Unraid](../README.md#install-on-unraid).
