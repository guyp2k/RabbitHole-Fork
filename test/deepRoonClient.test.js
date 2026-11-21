"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { DeepRoonClient, READ_TOOLS } = require("../src/deepRoonClient");

function fakeServer({ expireFirstCall = false } = {}) {
  const calls = [];
  let sessions = 0;
  let expired = !expireFirstCall;
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, session: init.headers["Mcp-Session-Id"] || "" });
    if (body.method === "initialize") {
      sessions += 1;
      return new Response(`data: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { serverInfo: { name: "deep-roon-mcp" } } })}\n\n`,
        { status: 200, headers: { "Content-Type": "text/event-stream", "Mcp-Session-Id": `s${sessions}` } });
    }
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (!expired) { expired = true; return new Response("unknown session", { status: 404 }); }
    const payload = { total: 1, rows: [{ key: "42", title: "Silk Degrees" }] };
    return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } })}\n\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream" } });
  };
  return { calls, fetchImpl };
}

test("a tool outside the read-only allowlist is refused before any request leaves Rabbit Hole", async () => {
  const server = fakeServer();
  const client = new DeepRoonClient({ url: "http://deep-roon.test/mcp", fetchImpl: server.fetchImpl });
  for (const name of ["roon_play", "roon_tag_albums", "roon_favorite", "roon_library_add", "roon_volume", "roon_queue_clear"]) {
    await assert.rejects(client.call(name, {}), /not on Rabbit Hole's read-only allowlist/);
  }
  assert.equal(server.calls.length, 0);
  assert.equal([...READ_TOOLS].some((name) => /play|tag_|favorite|_set|_add|_delete|_create|volume|queue|control|transfer|group|standby|sleep|seek|reset/.test(name)), false);
});

test("a read tool returns the JSON the server sent as text content", async () => {
  const server = fakeServer();
  const client = new DeepRoonClient({ url: "http://deep-roon.test/mcp", fetchImpl: server.fetchImpl });
  assert.deepEqual(await client.call("roon_library", { identified: false }), { total: 1, rows: [{ key: "42", title: "Silk Degrees" }] });
  const toolCall = server.calls.find((call) => call.body.method === "tools/call");
  assert.deepEqual(toolCall.body.params, { name: "roon_library", arguments: { identified: false } });
  assert.equal(toolCall.session, "s1");
});

test("an expired Deep Roon session is opened again once and the call still answers", async () => {
  const server = fakeServer({ expireFirstCall: true });
  const client = new DeepRoonClient({ url: "http://deep-roon.test/mcp", fetchImpl: server.fetchImpl });
  await client.call("roon_focus", {});
  assert.equal(server.calls.filter((call) => call.body.method === "initialize").length, 2);
  assert.deepEqual(server.calls.filter((call) => call.body.method === "tools/call").map((call) => call.session), ["s1", "s2"]);
});

test("without DEEP_ROON_URL the client reports itself unavailable instead of guessing a host", async () => {
  const client = new DeepRoonClient({ url: "" });
  assert.equal(client.enabled, false);
  await assert.rejects(client.call("roon_library", {}), (error) => error.statusCode === 503 && /DEEP_ROON_URL/.test(error.message));
});

test("a tool error from Deep Roon surfaces as an error, not as data", async () => {
  const client = new DeepRoonClient({ url: "http://deep-roon.test/mcp", fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    if (body.method === "initialize") return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: {} }), { headers: { "Content-Type": "application/json", "Mcp-Session-Id": "x" } });
    if (!body.id) return new Response(null, { status: 202 });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { isError: true, content: [{ type: "text", text: "Roon's internal protocol changed" }] } }), { headers: { "Content-Type": "application/json" } });
  } });
  await assert.rejects(client.call("roon_library", {}), /Roon's internal protocol changed/);
});
