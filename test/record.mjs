#!/usr/bin/env node
// node test/record.mjs: re-records test/fixtures/sources.json.gz through the real tools.
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer, createContext } from "../src/server.mjs";
import { fixtureKey } from "./replay.mjs";
import { NOW, SCENARIOS } from "./scenarios.mjs";

const recorded = {};
const recordingFetch = async (url, init) => {
  const res = await fetch(url, init);
  const body = await res.text();
  // Fixtures keep the fields the server reads; code_info is cut as the server itself cuts it.
  let kept = body;
  if (res.ok && String(url).includes("api.fda.gov")) {
    const d = JSON.parse(body);
    for (const r of d.results ?? []) if (typeof r.code_info === "string") r.code_info = r.code_info.slice(0, 2000);
    kept = JSON.stringify(d);
  }
  recorded[fixtureKey(url)] = { status: res.status, body: kept };
  return new Response(body, { status: res.status, headers: res.headers });
};
const server = buildServer(createContext({ fetchImpl: recordingFetch, now: () => NOW }));
const [a, b] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "record", version: "0" });
await Promise.all([server.connect(a), client.connect(b)]);
for (const s of SCENARIOS) {
  const res = await client.callTool({ name: s.tool, arguments: s.args });
  if (Boolean(res.isError) !== Boolean(s.expectError)) console.error(`unexpected result for ${s.label}: ${res.content[0].text.slice(0, 200)}`);
}
const sorted = Object.fromEntries(Object.entries(recorded).sort(([x], [y]) => x.localeCompare(y)));
const gz = gzipSync(JSON.stringify(sorted), { level: 9 });
writeFileSync(new URL("./fixtures/sources.json.gz", import.meta.url), gz);
console.log(`recorded ${Object.keys(sorted).length} responses, ${gz.length} bytes compressed`);
