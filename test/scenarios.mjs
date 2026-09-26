// The calls the golden tests replay and scripts/perf.mjs times. test/record.mjs runs them against
// CPSC, openFDA, NHTSA and vPIC and stores the responses, compressed, in test/fixtures.
export const NOW = Date.parse("2026-09-26T12:00:00Z");

export const SCENARIOS = [
  { label: "check_recalls: Fisher-Price Rock n Play sleeper", tool: "check_recalls", args: { query: "Fisher-Price Rock n Play sleeper" }, example: true },
  { label: "check_recalls: insulin pump (FDA devices)", tool: "check_recalls", args: { query: "insulin pump" } },
  { label: "check_recalls: peanut butter, FDA food only", tool: "check_recalls", args: { query: "peanut butter", sources: ["fda_food"] } },
  { label: "vehicle_recalls: 2018 Honda Accord", tool: "vehicle_recalls", args: { make: "Honda", model: "Accord", year: 2018 } },
  { label: "vehicle_recalls: a VIN with a wrong check digit", tool: "vehicle_recalls", args: { vin: "1HGCV1F34JA000001" } },
  { label: "recent_recalls: last 7 days", tool: "recent_recalls", args: { days: 7 } },
  { label: "check_recalls: nothing given", tool: "check_recalls", args: {}, expectError: true },
];
