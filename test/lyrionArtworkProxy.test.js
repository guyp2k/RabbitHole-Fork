"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createLyrionApi } = require("../src/lyrionApi");

const listen = (handler) => new Promise((resolve) => {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
});

test("redirected favorite logos load from hosts that refuse Node's default User-Agent", async (t) => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const cdn = await listen((req, res) => {
    if ((req.headers["user-agent"] || "") === "node") { res.writeHead(403, { "Content-Type": "text/html" }); return res.end("Forbidden"); }
    res.writeHead(200, { "Content-Type": "image/png" }); res.end(png);
  });
  const lms = await listen((req, res) => { res.writeHead(301, { Location: `${cdn.origin}/logos/512/dronezone512.png` }); res.end(); });
  t.after(() => { cdn.server.close(); lms.server.close(); });
  let failure = null;
  const api = createLyrionApi({ roon: { getState: () => ({ zones: [] }) }, client: { baseUrl: lms.origin },
    file: "does-not-exist", readJson: async () => ({}), sendJson: (_res, status, body) => { failure = { status, body }; } });
  const reply = { headers: null, body: null, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
  const url = new URL(`http://rh.test/api/lyrion/artwork?path=${encodeURIComponent("/imageproxy/https%3A%2F%2Fapi.somafm.com%2Flogos%2F512%2Fdronezone512.png/image.png")}`);
  await api.handle({ method: "GET" }, reply, url);
  assert.equal(failure, null);
  assert.equal(reply.status, 200);
  assert.equal(reply.headers["Content-Type"], "image/png");
  assert.deepEqual(reply.body, png);
});
