"use strict";

const READ_TOOLS = new Set([
  "roon_library", "roon_focus", "roon_search", "roon_album", "roon_review", "roon_versions",
  "roon_top", "roon_history", "roon_similar", "roon_daily_picks", "roon_new_for_you", "roon_track_files", "roon_status"
]);

function unavailable(message) {
  return Object.assign(new Error(message), { statusCode: 503 });
}

async function readMessage(response) {
  const type = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!type.includes("text/event-stream")) return text ? JSON.parse(text) : null;
  let message = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data.startsWith("{")) message = JSON.parse(data);
  }
  return message;
}

class DeepRoonClient {
  constructor({ url = process.env.DEEP_ROON_URL || "", fetchImpl = fetch, timeoutMs = 20000 } = {}) {
    this.url = String(url || "").trim();
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.sessionId = "";
    this.opening = null;
    this.nextId = 1;
  }

  get enabled() { return Boolean(this.url); }

  async post(body, sessionId = "") {
    const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    let response;
    try {
      response = await this.fetchImpl(this.url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw unavailable(`Deep Roon MCP did not answer: ${error.message}`);
    }
    return response;
  }

  async open() {
    const response = await this.post({ jsonrpc: "2.0", id: this.nextId++, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "rabbit-hole", version: "1" } } });
    if (!response.ok) throw unavailable(`Deep Roon MCP refused the session (HTTP ${response.status}).`);
    await readMessage(response);
    const sessionId = response.headers.get("mcp-session-id") || "";
    await (await this.post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId)).text();
    return sessionId;
  }

  async session() {
    if (this.sessionId) return this.sessionId;
    this.opening ||= this.open().finally(() => { this.opening = null; });
    this.sessionId = await this.opening;
    return this.sessionId;
  }

  async call(name, args = {}) {
    if (!READ_TOOLS.has(name)) throw new Error(`Deep Roon tool ${name} is not on Rabbit Hole's read-only allowlist.`);
    if (!this.enabled) throw unavailable("Deep Roon MCP is not configured: set DEEP_ROON_URL.");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sessionId = await this.session();
      const response = await this.post({ jsonrpc: "2.0", id: this.nextId++, method: "tools/call", params: { name, arguments: args } }, sessionId);
      if ((response.status === 404 || response.status === 400) && attempt === 0) {
        await response.text();
        this.sessionId = "";
        continue;
      }
      if (!response.ok) throw unavailable(`Deep Roon MCP answered HTTP ${response.status}.`);
      const message = await readMessage(response);
      if (message?.error) throw new Error(`Deep Roon MCP: ${message.error.message}`);
      const result = message?.result || {};
      const text = (result.content || []).map((part) => part.text || "").join("");
      if (result.isError) throw new Error(`Deep Roon MCP: ${text || "tool failed"}`);
      if (result.structuredContent) return result.structuredContent;
      return text.trim().startsWith("{") || text.trim().startsWith("[") ? JSON.parse(text) : { text };
    }
    throw unavailable("Deep Roon MCP session could not be reopened.");
  }
}

module.exports = { DeepRoonClient, READ_TOOLS };
