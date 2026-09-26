// src/text.mjs
//
// How a query meets a recall record. Every agency writes its records differently (CPSC titles,
// FDA product descriptions full of UPC lists, FSIS press releases in HTML, NHTSA defect summaries),
// so all of them go through the same normalisation: accents folded, apostrophes dropped
// ("Boar's" and "Boars" are one word), words lightly stemmed ("sleepers" meets "sleeper"),
// model numbers compared without their separators ("KX-1234" meets "kx1234") and barcodes
// compared digit for digit in every form the agencies print them.

const STOPWORDS = new Set(
  "a an and any are as at by for from has have i in is it its me my of on or our recall recalled recalls safety safe the this to was were with".split(" "),
);
// Words agents add about the search itself ("FDA device recall 2026"), not about the product: they
// never appear in the records' product text, so they rank but never exclude.
const META = new Set("fda cpsc nhtsa usda fsis agency agencies report reports reported enforcement notice notices announcement announced class classification device devices food foods drug drugs product products consumer model latest recent newest".split(" "));
// Sizes and counts rarely appear the same way in a record, so they help ranking but never gate it.
const UNITS = new Set("oz ounce ounces fl lb lbs pound pounds g gram grams kg mg ml l liter liters litre litres ct count pack pk pcs piece pieces inch inches in ft cm mm".split(" "));

export const MAX_TERMS = 6;

/** Lower case, accents folded, HTML entities decoded. */
export function fold(text) {
  return decodeEntities(String(text ?? ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const NAMED = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
export function decodeEntities(text) {
  return String(text ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Plain text from an HTML fragment (FSIS summaries). */
export function stripHtml(html) {
  return decodeEntities(String(html ?? "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Light English stemmer: enough that plurals meet singulars, never so much that words collide. */
export function stem(word) {
  const w = word;
  if (w.length <= 3 || /\d/.test(w)) return w;
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(sses|xes|ches|shes|zes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

const dropApostrophes = (s) => s.replace(/['‘’`´]/g, "");

/** Stemmed words of a text, in order. */
export function words(text) {
  return dropApostrophes(fold(text))
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem);
}

/** Model-number-like chunks ("KX-1234", "UDSX500S11", "F-150"), separators removed. */
export function codes(text) {
  const out = [];
  for (const m of dropApostrophes(fold(text)).matchAll(/[a-z0-9]+(?:[-./][a-z0-9]+)*/g)) {
    const compact = m[0].replace(/[-./]/g, "");
    if (compact.length >= 3 && /\d/.test(compact) && /[a-z]/.test(compact)) out.push(compact);
    // Parts of a hyphenated chunk are codes too: "SKU UDSX500-S11" lists "udsx500".
    if (m[0] !== compact) for (const part of m[0].split(/[-./]/)) if (part.length >= 3 && /\d/.test(part) && /[a-z]/.test(part)) out.push(part);
  }
  return out;
}

/** Digit runs that could be barcodes: 8+ digits, single spaces or hyphens allowed between groups. */
export function digitRuns(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(/\d(?:[ -]?\d){7,}/g)) out.push(m[0].replace(/[ -]/g, ""));
  return out;
}

const stripZeros = (d) => d.replace(/^0+/, "");

/** GTIN check digit test for 8, 12, 13 and 14 digit codes. */
export function gtinCheckOk(digits) {
  if (![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

/** UPC-E (8 digits, number system 0 or 1) to its UPC-A form. */
export function upcEToA(e) {
  if (!/^[01]\d{7}$/.test(e)) return undefined;
  const [n, d1, d2, d3, d4, d5, d6, c] = e;
  let mid;
  if ("012".includes(d6)) mid = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === "3") mid = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === "4") mid = `${d1}${d2}${d3}${d4}00000${d5}`;
  else mid = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${n}${mid}${c}`;
}

/**
 * Every form an agency might print a barcode in. FDA often lists the 10-digit core of a UPC-A
 * (manufacturer and item, no number system or check digit), sometimes 11 digits without the check
 * digit, sometimes spaced "0 51500 25516 2"; CPSC lists 12 digits.
 * @returns {{digits: string, keys: Set<string>, core: string|undefined, checkOk: boolean}|undefined}
 */
export function upcForms(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return undefined;
  const checkOk = gtinCheckOk(digits);
  const variants = [digits];
  const expanded = digits.length === 8 ? upcEToA(digits) : undefined;
  if (expanded) variants.push(expanded);
  const keys = new Set();
  let core;
  for (const v of variants) {
    keys.add(stripZeros(v));
    if (v.length >= 11) keys.add(stripZeros(v.slice(0, -1)));
    const a = stripZeros(v).padStart(12, "0");
    if (a.length === 12 && !core) core = a.slice(1, 11);
  }
  keys.delete("");
  return { digits, keys, core, checkOk };
}

/** True when a record digit run is the queried barcode in one of its printed forms. */
export function upcMatches(forms, run) {
  if (!forms) return false;
  if (forms.keys.has(stripZeros(run))) return true;
  if (forms.core && run.length === 10 && run === forms.core) return true;
  // Lists printed without separators ("51500720015150024094") hold whole codes back to back.
  return Boolean(forms.core && run.length > 14 && run.includes(forms.core));
}

/**
 * Splits a free-text query into terms.
 *   word  a stemmed word every match must contain (brand, product, type)
 *   code  a model or part number, compared without separators
 *   extra a size, count or short number: ranks matches higher, never excludes one
 * @returns {{terms: {kind: "word"|"code", key: string, raw: string}[], extras: string[], dropped: string[]}}
 */
export function parseQuery(text) {
  const terms = [];
  const extras = [];
  const seen = new Set();
  for (const chunk of dropApostrophes(fold(text)).split(/[\s,;:()"[\]{}!?]+/)) {
    const c = chunk.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
    if (!c) continue;
    const compact = c.replace(/[^a-z0-9]/g, "");
    const hasDigit = /\d/.test(compact);
    const hasLetter = /[a-z]/.test(compact);
    if (hasDigit && hasLetter && compact.length >= 3 && !/^\d+[a-z]{1,3}$/.test(compact)) {
      // "BYL001", "KX-1234", "F-150"; but "16oz" and "3pk" are sizes.
      if (!seen.has(`c:${compact}`)) terms.push({ kind: "code", key: compact, raw: c });
      seen.add(`c:${compact}`);
      continue;
    }
    if (hasDigit && !hasLetter) {
      if (compact.length >= 6) {
        if (!seen.has(`c:${compact}`)) terms.push({ kind: "code", key: compact, raw: c });
        seen.add(`c:${compact}`);
      } else extras.push(compact);
      continue;
    }
    if (hasDigit) {
      extras.push(compact);
      continue;
    }
    for (const w of c.split(/[^a-z0-9]+/).filter(Boolean)) {
      if (w.length < 2 || STOPWORDS.has(w)) continue;
      if (UNITS.has(w) || META.has(w)) {
        extras.push(w);
        continue;
      }
      const key = stem(w);
      if (seen.has(`w:${key}`)) continue;
      seen.add(`w:${key}`);
      terms.push({ kind: "word", key, raw: w });
    }
  }
  return { terms: terms.slice(0, MAX_TERMS), extras: [...new Set(extras)], dropped: terms.slice(MAX_TERMS).map((t) => t.raw) };
}

/**
 * Analyses one record's text for matching.
 * @param {{primary: string[], secondary: string[]}} fields  primary: title, product, brand, firm;
 *   secondary: description, reason, code lists and the rest
 */
export function analyze({ primary, secondary }) {
  const pWords = primary.flatMap((t) => words(t));
  const sWords = secondary.flatMap((t) => words(t));
  const all = [...primary, ...secondary];
  return {
    primary: new Set(pWords),
    secondary: new Set(sWords),
    // Primary fields joined, for the in-order phrase bonus.
    primaryText: ` ${primary.map((t) => words(t).join(" ")).join(" | ")} `,
    codes: new Set(all.flatMap((t) => codes(t))),
    runs: all.flatMap((t) => digitRuns(t)),
  };
}

export const CONFIDENCE = ["exact", "high", "medium", "low"];

/**
 * Scores one analysed record against a parsed query.
 *   exact   the barcode matched, or every term matched including a model number of 5+ characters
 *   high    every term matched in the title, product name or brand/firm
 *   medium  every term matched, some only in the description or reason text
 *   low     all but one term matched (only asked for when nothing matched fully)
 * @returns {{confidence: string, score: number, matched: string[], missing: string[], upc: boolean}|null}
 */
export function scoreRecord(query, a, { allowMissing = 0 } = {}) {
  const upc = query.upc ? a.runs.some((r) => upcMatches(query.upc, r)) : false;
  const matched = [];
  const missing = [];
  let score = 0;
  let allPrimary = true;
  let longCode = false;
  for (const t of query.terms) {
    if (t.kind === "code") {
      if (a.codes.has(t.key)) {
        matched.push(t.raw);
        score += 4;
        if (t.key.length >= 5) longCode = true;
      } else if (t.key.length >= 5 && [...a.codes].some((c) => c.startsWith(t.key))) {
        matched.push(t.raw);
        score += 3;
      } else if (/^\d+$/.test(t.key) && a.runs.some((r) => r.includes(t.key))) {
        matched.push(t.raw);
        score += 3;
      } else missing.push(t.raw);
    } else if (a.primary.has(t.key)) {
      matched.push(t.raw);
      score += 3;
    } else if (a.secondary.has(t.key)) {
      matched.push(t.raw);
      score += 1;
      allPrimary = false;
    } else missing.push(t.raw);
  }
  for (const x of query.extras) if (a.primary.has(x) || a.secondary.has(x)) score += 0.5;
  if (query.terms.length >= 2 && a.primaryText.includes(` ${query.terms.map((t) => t.key).join(" ")} `)) score += 2;
  if (upc) return { confidence: "exact", score: score + 10, matched: ["upc", ...matched], missing, upc };
  if (!query.terms.length || missing.length > allowMissing || !matched.length) return null;
  let confidence;
  if (missing.length) confidence = "low";
  else if (longCode) confidence = "exact";
  else confidence = allPrimary ? "high" : "medium";
  return { confidence, score, matched, missing, upc };
}

/** Sort key: confidence first, then score, then newest. */
export function compareMatches(x, y) {
  return CONFIDENCE.indexOf(x.confidence) - CONFIDENCE.indexOf(y.confidence) || y._score - x._score || String(y.date ?? "").localeCompare(String(x.date ?? ""));
}

/** "2026-09-24T00:00:00" or "20260924" or "24/09/2026" to "2026-09-24". */
export function isoDay(value) {
  const s = String(value ?? "");
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); // NHTSA writes day/month/year
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return undefined;
}
