// Golden tests: every tool over a real MCP client, replaying responses recorded by test/record.mjs.
// No test here touches the network.
import assert from "node:assert/strict";
import test from "node:test";
import { call, connect, replayFetch } from "./replay.mjs";

test("check_recalls: a consumer product across agencies, with confidence, hazard and remedy", async () => {
  const client = await connect();
  const { res, data } = await call(client, "check_recalls", { query: "Fisher-Price Rock n Play sleeper" });
  assert.ok(!res.isError);
  assert.equal(data.searched.length, 4);
  const top = data.results[0];
  assert.equal(top.agency, "CPSC (consumer products)");
  assert.match(top.title, /Rock 'n Play/);
  assert.ok(["exact", "high"].includes(top.confidence));
  assert.match(top.hazard, /Infant fatalities/);
  assert.match(top.url, /^https:\/\/www\.cpsc\.gov\/Recalls\//);
  assert.equal(top.fields, undefined, "internal matching fields are not returned");
});

test("check_recalls: a medical device from FDA, without dumping serial-number lists", async () => {
  const client = await connect();
  const { data } = await call(client, "check_recalls", { query: "insulin pump" });
  const device = data.results.find((r) => r.agency === "FDA (medical devices)");
  assert.ok(device);
  assert.match(device.classification, /^Class (I|II|III)$/);
  assert.ok(data.results.every((r) => !("code_info" in r)));
  assert.ok(JSON.stringify(data).length < 30_000, "compact results");
});

test("check_recalls: one agency only, and a capped search says more may exist", async () => {
  const { impl, calls } = replayFetch();
  const client = await connect(impl);
  const { data } = await call(client, "check_recalls", { query: "peanut butter", sources: ["fda_food"] });
  assert.deepEqual(data.searched, ["FDA (food)"]);
  assert.ok(calls.every((c) => c.startsWith("api.fda.gov/food/")));
  assert.deepEqual(data.more_may_exist, ["FDA (food)"]);
  assert.ok(data.results.every((r) => /peanut/i.test(r.title) && /butter/i.test(r.title + (r.product ?? ""))));
  assert.ok(data.results.every((r) => !/\s{2,}/.test(r.title)), "FDA's padding is squeezed");
});

test("check_recalls: asking with nothing is a clear error", async () => {
  const client = await connect();
  const { res, data } = await call(client, "check_recalls", {});
  assert.equal(res.isError, true);
  assert.equal(data.error.code, "missing_query");
});

test("vehicle_recalls: campaigns for a model year, newest first, with park-it flags", async () => {
  const client = await connect();
  const { data } = await call(client, "vehicle_recalls", { make: "Honda", model: "Accord", year: 2018 });
  assert.equal(data.total, 6);
  const dates = data.recalls.map((r) => r.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.ok(data.recalls.every((r) => /^\d{2}V\d{6}$/.test(r.campaign)));
  assert.ok(data.recalls.every((r) => typeof r.park_it === "boolean"));
});

test("vehicle_recalls: a VIN is decoded, and a wrong check digit is reported, not hidden", async () => {
  const client = await connect();
  const { data } = await call(client, "vehicle_recalls", { vin: "1HGCV1F34JA000001" });
  assert.deepEqual([data.vehicle.make, data.vehicle.model, data.vehicle.year], ["HONDA", "Accord", "2018"]);
  assert.equal(data.vehicle.check_digit_ok, false);
  assert.match(data.vehicle.note, /Check Digit/);
  const bad = await call(client, "vehicle_recalls", { vin: "1HGCV1F34JA00000O" });
  assert.equal(bad.data.error.code, "bad_vin", "letters I, O and Q never appear in a VIN");
});

test("recent_recalls: the last week across agencies, newest first, with FDA's publishing lag explained", async () => {
  const client = await connect();
  const { data } = await call(client, "recent_recalls", { days: 7 });
  assert.equal(data.since, "2026-09-19");
  assert.ok(data.total > 0);
  assert.ok(data.results.every((r) => r.date >= "2026-09-19"));
  assert.match(data.note, /weekly/);
});

test("check_recalls: when nothing matches every term, near matches come back flagged low", async () => {
  const fixtures = {
    "www.saferproducts.gov/RestWebServices/Recall?format=json&ProductName=heater": { status: 200, body: JSON.stringify([{ RecallNumber: 1, RecallDate: "2026-01-01T00:00:00", Title: "Acme Recalls Space Heaters", Products: [{ Name: "Acme space heater" }], URL: "https://www.cpsc.gov/Recalls/x" }]) },
  };
  const impl = async (url) => {
    const u = new URL(url);
    const hit = fixtures[`${u.host}${u.pathname}${u.search}`];
    return hit ? new Response(hit.body, { status: hit.status }) : new Response("{}", { status: 404 });
  };
  const client = await connect(impl);
  const { data } = await call(client, "check_recalls", { query: "acme heater purple" });
  assert.equal(data.near_matches_only, true);
  assert.equal(data.results[0].confidence, "low");
  assert.deepEqual(data.results[0].missing, ["purple"]);
});
