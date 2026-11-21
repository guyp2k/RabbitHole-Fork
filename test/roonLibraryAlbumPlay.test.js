"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { RoonClient } = require("../src/roonClient");

function libraryRoon(albums, { pageSize = 2 } = {}) {
  const client = new RoonClient();
  const pressed = [];
  const opened = [];
  const sessions = new Map();
  const actions = ["Play Now", "Add Next", "Queue", "Start Radio"];
  client.transport = {};
  client.zones.set("zone-1", { zone_id: "zone-1", display_name: "HQPd", outputs: [{ output_id: "out-1" }] });
  client.browse = {
    browse(options, cb) {
      assert.equal(options.hierarchy, "albums");
      const session = sessions.get(options.multi_session_key) || { level: "root" };
      sessions.set(options.multi_session_key, session);
      if (options.pop_all) { session.level = "root"; return cb(false, { action: "list", list: { count: albums.length } }); }
      opened.push(options.item_key);
      if (options.item_key.startsWith("album:")) { session.level = options.item_key; return cb(false, { action: "list" }); }
      if (options.item_key.startsWith("menu:")) { session.level = options.item_key; return cb(false, { action: "list" }); }
      if (options.item_key.startsWith("act:")) {
        assert.equal(options.zone_or_output_id, "out-1");
        pressed.push(options.item_key);
        return cb(false, { action: "none" });
      }
      return cb(false, { action: "message", message: "unknown" });
    },
    load(options, cb) {
      const session = sessions.get(options.multi_session_key);
      if (session.level === "root") {
        const items = albums.slice(options.offset, options.offset + Math.min(options.count, pageSize))
          .map((album, index) => ({ title: album.title, subtitle: album.artist, item_key: `album:${options.offset + index}`, hint: "list" }));
        return cb(false, { items, list: { count: albums.length } });
      }
      if (session.level.startsWith("album:")) {
        return cb(false, { items: [{ title: "Play Album", hint: "action_list", item_key: `menu:${session.level}` }, { title: "1. Track", hint: "action_list", item_key: "track:1" }], list: { count: 2 } });
      }
      return cb(false, { items: actions.map((title) => ({ title, hint: "action", item_key: `act:${title}:${session.level}` })), list: { count: actions.length } });
    }
  };
  return { client, pressed, opened };
}

const shelf = [
  { title: "Abbey Road", artist: "The Beatles" },
  { title: "Boz Scaggs - Silk Degrees", artist: "Unknown Artist" },
  { title: "Rumours", artist: "Fleetwood Mac" },
  { title: "Rumours", artist: "Fleetwood Mac" },
  { title: "Silk Degrees", artist: "Boz Scaggs" },
  { title: "Abbey Road", artist: "Abbey Road Tribute Band" },
  { title: "Abbey Road (Super Deluxe)", artist: "The Beatles" }
];

test("an album found once in Roon's library by exact title and artist runs Roon's own Play Now on the chosen zone", async () => {
  const { client, pressed } = libraryRoon(shelf);
  const result = await client.playLibraryAlbum({ title: "Silk Degrees", artists: ["Boz Scaggs"] }, "zone-1", "play");
  assert.equal(result.success, true);
  assert.equal(result.action, "Play Now");
  assert.deepEqual(pressed, ["act:Play Now:menu:album:4"]);
});

test("each requested action maps to Roon's matching action and nothing else", async () => {
  for (const [action, title] of [["next", "Add Next"], ["queue", "Queue"], ["radio", "Start Radio"]]) {
    const { client, pressed } = libraryRoon(shelf);
    const result = await client.playLibraryAlbum({ title: "Abbey Road", artists: ["The Beatles"] }, "zone-1", action);
    assert.equal(result.action, title);
    assert.deepEqual(pressed, [`act:${title}:menu:album:0`]);
  }
});

test("a same-title album by another artist or a longer title is never counted as the requested album", async () => {
  const { client, pressed } = libraryRoon(shelf);
  const result = await client.playLibraryAlbum({ title: "Abbey Road", artists: ["The Beatles"] }, "zone-1", "play");
  assert.equal(result.success, true);
  assert.deepEqual(result.match, { title: "Abbey Road", subtitle: "The Beatles" });
  assert.deepEqual(pressed, ["act:Play Now:menu:album:0"]);
});

test("an unidentified rip matches on its exact title and the artist Roon shows for it", async () => {
  const { client, pressed } = libraryRoon(shelf);
  const result = await client.playLibraryAlbum({ title: "Boz Scaggs - Silk Degrees", artists: ["Unknown Artist", "Various Artists"] }, "zone-1", "play");
  assert.equal(result.success, true);
  assert.deepEqual(pressed, ["act:Play Now:menu:album:1"]);
});

test("two library albums with the same title and artist are refused instead of guessed, and nothing plays", async () => {
  const { client, pressed, opened } = libraryRoon(shelf);
  const result = await client.playLibraryAlbum({ title: "Rumours", artists: ["Fleetwood Mac"] }, "zone-1", "play");
  assert.equal(result.success, false);
  assert.match(result.reason, /2 albums in your Roon library are called "Rumours"/);
  assert.deepEqual(pressed, []);
  assert.deepEqual(opened, []);
});

test("an album that is not in Roon's library is reported, never replaced by a near match", async () => {
  const { client, pressed } = libraryRoon(shelf);
  const result = await client.playLibraryAlbum({ title: "Silk Degrees (Remastered)", artists: ["Boz Scaggs"] }, "zone-1", "play");
  assert.equal(result.success, false);
  assert.match(result.reason, /not in your Roon library/);
  assert.deepEqual(pressed, []);
});

test("an unknown action or a missing zone is rejected before Roon is touched", async () => {
  const { client, opened } = libraryRoon(shelf);
  await assert.rejects(client.playLibraryAlbum({ title: "Abbey Road", artists: ["The Beatles"] }, "zone-1", "shuffle"), /Unknown album action/);
  await assert.rejects(client.playLibraryAlbum({ title: "Abbey Road", artists: ["The Beatles"] }, "no-such-zone", "play"), /Pick a Roon zone/);
  assert.deepEqual(opened, []);
});
