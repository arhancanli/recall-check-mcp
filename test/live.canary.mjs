// Weekly canary (.github/workflows/canary.yml): the tools against live CPSC, openFDA, NHTSA and
// vPIC. Asserts only facts that should not change.
import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.mjs";

const client = new Client({ name: "canary", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([buildServer().connect(a), client.connect(b)]);

test("live: known recalls still come back", { timeout: 120_000 }, async () => {
  const sleeper = await client.callTool({ name: "check_recalls", arguments: { query: "Rock n Play sleeper", sources: ["cpsc"] } });
  assert.ok(sleeper.structuredContent.results.some((r) => /Rock 'n Play/.test(r.title)));
  const car = await client.callTool({ name: "vehicle_recalls", arguments: { make: "Honda", model: "Accord", year: 2018 } });
  assert.ok(car.structuredContent.total >= 6);
  const vin = await client.callTool({ name: "vehicle_recalls", arguments: { vin: "1HGCV1F34JA000001" } });
  assert.equal(vin.structuredContent.vehicle.check_digit_ok, false);
  await client.close();
});
