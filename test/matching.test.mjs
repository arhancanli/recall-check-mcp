// Matching rules on synthetic records: words, model numbers, barcodes, confidence.
import assert from "node:assert/strict";
import test from "node:test";
import { analyze, gtinCheckOk, parseQuery, scoreRecord, stem, upcEToA, upcForms, upcMatches, words } from "../src/text.mjs";
import { fromCpsc, fromFda } from "../src/sources.mjs";

const rec = (primary, secondary = []) => analyze({ primary, secondary });
const q = (text, upc) => ({ ...parseQuery(text), upc: upc ? upcForms(upc) : undefined });

test("words: accents, apostrophes and plurals meet their plain forms", () => {
  assert.deepEqual(words("Boar's Head Sleepers"), ["boar", "head", "sleeper"]);
  assert.deepEqual(words("Crème Brûlée"), ["creme", "brulee"]);
  assert.equal(stem("batteries"), "battery");
  assert.equal(stem("glass"), "glass");
});

test("query parsing: model numbers are codes, sizes are extras, stopwords go", () => {
  const p = parseQuery("the KX-1234 heater 16oz recall");
  assert.deepEqual(p.terms.map((t) => [t.kind, t.key]), [["code", "kx1234"], ["word", "heater"]]);
  assert.deepEqual(p.extras, ["16oz"]);
});

test("confidence: exact for a long model number, high in the title, medium in the description, low only when allowed", () => {
  assert.equal(scoreRecord(q("heater KX-1234"), rec(["Acme heater"], ["model KX1234"])).confidence, "exact");
  assert.equal(scoreRecord(q("acme heater"), rec(["Acme space heater"])).confidence, "high");
  assert.equal(scoreRecord(q("acme heater"), rec(["Acme products"], ["the heater may overheat"])).confidence, "medium");
  assert.equal(scoreRecord(q("acme heater blue"), rec(["Acme heater"])), null, "a missing term excludes by default");
  assert.equal(scoreRecord(q("acme heater blue"), rec(["Acme heater"]), { allowMissing: 1 }).confidence, "low");
});

test("barcodes: check digits, UPC-E expansion, and every printed form", () => {
  assert.ok(gtinCheckOk("036000291452"));
  assert.ok(!gtinCheckOk("036000291453"));
  assert.equal(upcEToA("04252614"), "042100005264");
  const forms = upcForms("0 36000 29145 2");
  assert.ok(upcMatches(forms, "036000291452"));
  assert.ok(upcMatches(forms, "3600029145"), "FDA's 10-digit core");
  assert.ok(upcMatches(forms, "03600029145"), "11 digits without the check digit");
  assert.ok(!upcMatches(forms, "036000291469"));
  assert.equal(scoreRecord(q("", "036000291452"), rec(["Snack"], ["UPC 0 36000 29145 2"])).confidence, "exact");
});

test("normalising agency records: CPSC lists, FDA padding and giant code lists", () => {
  const c = fromCpsc({ RecallNumber: 26001, RecallDate: "2026-09-24T00:00:00", Title: "Acme Recalls Heaters", Products: [{ Name: "Space heater", Model: "KX-1234", NumberOfUnits: "About 1,000" }], Hazards: [{ Name: "Fire" }], Remedies: [{ Name: "Refund" }], Manufacturers: [{ Name: "Acme" }], URL: "https://www.cpsc.gov/Recalls/x" });
  assert.deepEqual([c.id, c.date, c.product, c.hazard, c.remedy, c.firm], ["26001", "2026-09-24", "Space heater", "Fire", "Refund", "Acme"]);
  const f = fromFda("fda_device", { recall_number: "Z-1", report_date: "20260826", product_description: "Pump     Model  X", code_info: "S".repeat(50_000), classification: "Class II" });
  assert.equal(f.title, "Pump Model X");
  assert.equal(f.date, "2026-08-26");
  assert.ok(f.fields.secondary[1].length <= 20_000);
});

test("barcodes: FDA's 10-digit core also matches when the number system digit is not 0", () => {
  const forms = upcForms("123456789012");
  assert.ok(upcMatches(forms, "2345678901"));
  assert.ok(!upcMatches(forms, "2345678902"));
});
