"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { RoonClient } = require("../src/roonClient");

function pairedClient(zones) {
  const client = new RoonClient();
  let onZones;
  client.attachSocketDiagnostics = () => {};
  client.logConnectionDiagnostic = () => {};
  client.startHeartbeat = () => {};
  client.scheduleZonesEmit = () => {};
  client.status = { set_status() {} };
  client.handlePaired({ core_id: "core", display_name: "Core", services: {
    RoonApiTransport: { subscribe_zones: (callback) => { onZones = callback; }, subscribe_queue() {} },
    RoonApiBrowse: {}
  } });
  onZones("Subscribed", { zones });
  return { client, send: (data) => onZones("Changed", data) };
}

test("a zone Roon removes by its zone_id string leaves the cache and stops counting as playing", () => {
  const { client, send } = pairedClient([
    { zone_id: "gone", display_name: "DMP-A10", state: "playing", outputs: [] },
    { zone_id: "kept", display_name: "WiiM Pro BR", state: "stopped", outputs: [] }
  ]);
  client.queues.set("gone", { items: [] });
  send({ zones_removed: ["gone"] });
  assert.deepEqual([...client.zones.keys()], ["kept"]);
  assert.equal(client.queues.has("gone"), false);
});
