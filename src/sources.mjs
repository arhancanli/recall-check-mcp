// src/sources.mjs
//
// The agencies, each normalised to one record shape:
//   { agency, id, date, title, product, firm, hazard, remedy, classification, status, units, url,
//     upcs, fields: {primary, secondary} }
// CPSC (consumer products): saferproducts.gov REST service. FDA (food, drugs, devices): openFDA
// enforcement reports. NHTSA (vehicles): recalls by make, model and year, with VINs decoded by vPIC.
// USDA FSIS (meat and poultry) is not included: its API refuses automated requests.
import { clip } from "./kit/index.mjs";
import { isoDay, stripHtml } from "./text.mjs";

export const HOSTS = ["www.saferproducts.gov", "api.fda.gov", "api.nhtsa.gov", "vpic.nhtsa.dot.gov"];

export const LIMITS = [
  { host: "www.saferproducts.gov", perSecond: 2, concurrency: 2 },
  { host: "api.fda.gov", perSecond: 3, concurrency: 3 },
  { host: "api.nhtsa.gov", perSecond: 5, concurrency: 3 },
  { host: "vpic.nhtsa.dot.gov", perSecond: 5, concurrency: 2 },
];

export const AGENCIES = {
  cpsc: "CPSC (consumer products)",
  fda_food: "FDA (food)",
  fda_drug: "FDA (drugs)",
  fda_device: "FDA (medical devices)",
};

const enc = encodeURIComponent;
const names = (list, key = "Name") => (list ?? []).map((x) => x?.[key]).filter(Boolean);

export function fromCpsc(r) {
  const products = r.Products ?? [];
  const product = names(products).join("; ");
  const models = names(products, "Model").join("; ");
  const units = names(products, "NumberOfUnits").join("; ");
  const firms = [...names(r.Manufacturers), ...names(r.Importers), ...names(r.Distributors)];
  return {
    agency: "cpsc",
    id: String(r.RecallNumber ?? r.RecallID),
    date: isoDay(r.RecallDate),
    title: stripHtml(r.Title),
    product,
    firm: firms.join("; ") || undefined,
    hazard: names(r.Hazards).map(stripHtml).join(" ") || undefined,
    remedy: names(r.Remedies).map(stripHtml).join(" ") || undefined,
    units: units || undefined,
    injuries: names(r.Injuries).map(stripHtml).join(" ") || undefined,
    sold_at: names(r.Retailers).join("; ") || undefined,
    url: r.URL,
    upcs: names(r.ProductUPCs, "UPC"),
    fields: { primary: [stripHtml(r.Title), product, ...firms], secondary: [models, stripHtml(r.Description), names(r.ProductUPCs, "UPC").join(" ")] },
  };
}

const FDA_KIND = { fda_food: "food", fda_drug: "drug", fda_device: "device" };

const squash = (t) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim() : t);

// Device reports can list thousands of serial numbers in code_info (100 insulin pump reports came to
// 16 MB); the first 20,000 characters keep every UPC and lot pattern that matching uses in practice.
export const MAX_CODE_INFO = 20_000;

export function fromFda(agency, raw) {
  const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, squash(v)]));
  if (typeof r.code_info === "string" && r.code_info.length > MAX_CODE_INFO) r.code_info = r.code_info.slice(0, MAX_CODE_INFO);
  return {
    agency,
    id: r.recall_number,
    date: isoDay(r.report_date),
    title: clip(r.product_description ?? "", 200),
    product: r.product_description,
    firm: r.recalling_firm,
    hazard: r.reason_for_recall,
    classification: r.classification,
    status: r.status,
    units: r.product_quantity || undefined,
    distribution: r.distribution_pattern ? clip(r.distribution_pattern, 200) : undefined,
    url: "https://www.accessdata.fda.gov/scripts/ires/index.cfm",
    upcs: [],
    fields: { primary: [r.product_description ?? "", r.recalling_firm ?? ""], secondary: [r.reason_for_recall ?? "", r.code_info ?? ""] },
  };
}

/** CPSC recalls whose product name contains a term (the service filters server side), or with a UPC. */
export async function cpsc(ctx, { term, upc, since }) {
  const params = new URLSearchParams({ format: "json" });
  if (upc) params.set("UPC", upc);
  else if (term) params.set("ProductName", term);
  if (since) params.set("RecallDateStart", since);
  const { data } = await ctx.fetcher.getJson(`https://www.saferproducts.gov/RestWebServices/Recall?${params}`);
  return (Array.isArray(data) ? data : []).map(fromCpsc);
}

const q = (s) => `"${String(s).replace(/"/g, "")}"`;

/** openFDA enforcement reports matching every word in the product description or the firm. */
// Device reports are heavy (see MAX_CODE_INFO), so fewer are fetched per query.
const FDA_LIMIT = { fda_food: 100, fda_drug: 60, fda_device: 25 };

export async function fda(ctx, agency, { words = [], codes = [], upcCore, since, limit = FDA_LIMIT[agency] }) {
  const parts = [];
  if (upcCore) parts.push(`(product_description:${q(upcCore)} code_info:${q(upcCore)})`);
  for (const w of words) parts.push(`(product_description:${q(w)} recalling_firm:${q(w)})`);
  for (const c of codes) parts.push(`(product_description:${q(c)} code_info:${q(c)})`);
  if (since) parts.push(`report_date:[${since.replace(/-/g, "")} TO 29991231]`);
  const search = parts.join(" AND ") || "report_date:[19000101 TO 29991231]";
  const res = await ctx.fetcher.request(`https://api.fda.gov/${FDA_KIND[agency]}/enforcement.json?search=${enc(search).replace(/%20/g, "+")}&sort=report_date:desc&limit=${limit}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`api.fda.gov answered ${res.status}`);
  const d = JSON.parse(res.text);
  const records = (d.results ?? []).map((r) => fromFda(agency, r));
  // More reports matched than were fetched: the caller says so instead of implying a complete count.
  records.capped = (d.meta?.results?.total ?? 0) > records.length;
  return records;
}

/** VIN to make, model and year (NHTSA vPIC), with the check-digit verdict. */
export async function decodeVin(ctx, vin) {
  const { data } = await ctx.fetcher.getJson(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${enc(vin)}?format=json`);
  const r = data?.Results?.[0] ?? {};
  const codes = String(r.ErrorCode ?? "").split(",").map((c) => c.trim());
  return {
    make: r.Make || undefined,
    model: r.Model || undefined,
    year: r.ModelYear || undefined,
    trim: r.Trim || undefined,
    check_digit_ok: !codes.includes("1"),
    decoded: Boolean(r.Make && r.Model && r.ModelYear),
    note: codes.every((c) => c === "0") ? undefined : clip(String(r.ErrorText ?? ""), 200),
  };
}

export async function nhtsaByVehicle(ctx, { make, model, year }) {
  const { status, data } = await ctx.fetcher.getJson(`https://api.nhtsa.gov/recalls/recallsByVehicle?make=${enc(make)}&model=${enc(model)}&modelYear=${enc(year)}`, { allowStatus: [400, 404] });
  if (status !== 200) return [];
  return (data?.results ?? []).map((r) => ({
    campaign: r.NHTSACampaignNumber,
    date: isoDay(r.ReportReceivedDate),
    manufacturer: r.Manufacturer,
    component: r.Component,
    summary: clip(r.Summary ?? "", 500),
    consequence: clip(r.Consequence ?? "", 300),
    remedy: clip(r.Remedy ?? "", 300),
    park_it: Boolean(r.parkIt),
    park_outside: Boolean(r.parkOutSide),
    over_the_air: Boolean(r.overTheAirUpdate),
    url: `https://www.nhtsa.gov/recalls?nhtsaId=${enc(r.NHTSACampaignNumber)}`,
  }));
}
