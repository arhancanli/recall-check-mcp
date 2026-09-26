// src/check.mjs
//
// One query across agencies. Each agency is asked server side with the query's most distinctive
// term (a model number or UPC first, else the longest word), then every returned record is scored
// locally against the whole query (text.mjs): exact (UPC or long model number), high (every term in
// the title, product or firm), medium (some only in the description or reason) and, only when
// nothing matched fully, low (all but one term). The best matches across agencies come first.
import { clip, compact } from "./kit/index.mjs";
import { AGENCIES, cpsc, fda } from "./sources.mjs";
import { analyze, compareMatches, parseQuery, scoreRecord, upcForms } from "./text.mjs";

export const MAX_RESULTS = 10;

/** One result as an agent reads it: long agency texts clipped, internal fields dropped. */
export function presentRecord({ fields, upcs, _score, ...r }) {
  const product = r.product && r.title && r.title.startsWith(r.product.slice(0, 150)) ? undefined : r.product;
  return compact({ ...r, agency: AGENCIES[r.agency], title: clip(r.title ?? "", 200), product: product && clip(product, 250), hazard: r.hazard && clip(r.hazard, 400), remedy: r.remedy && clip(r.remedy, 300), injuries: r.injuries && clip(r.injuries, 250), units: r.units && clip(r.units, 120), sold_at: r.sold_at && clip(r.sold_at, 150), distribution: undefined });
}

export async function searchAgencies(ctx, args) {
  const out = await searchOnce(ctx, args);
  // A date filter that leaves nothing: say whether older matches exist, so "since" chosen too late
  // does not read as "never recalled".
  if (out.total === 0 && args.since) {
    const older = await searchOnce(ctx, { ...args, since: undefined });
    if (older.total) {
      // Show the most recent earlier matches, marked, rather than a bare "none since".
      return { ...older, results: older.results.map((r) => ({ ...r, before_since: true })), since_filter_empty: true, note: `Nothing matched since ${args.since}; these are the most recent earlier matches.` };
    }
  }
  return out;
}

async function searchOnce(ctx, { query = "", upc, sources = Object.keys(AGENCIES), since }) {
  const parsed = parseQuery(query);
  const forms = upc ? upcForms(upc) : undefined;
  const words = parsed.terms.filter((t) => t.kind === "word").map((t) => t.raw);
  const codes = parsed.terms.filter((t) => t.kind === "code").map((t) => t.raw);
  const lead = codes[0] ?? [...words].sort((a, b) => b.length - a.length)[0];
  const errors = [];
  const perAgency = await Promise.all(
    sources.map(async (agency) => {
      try {
        if (agency === "cpsc") return await cpsc(ctx, { term: lead, upc: forms?.digits, since });
        return await fda(ctx, agency, { words: words.slice(0, 3), codes: codes.slice(0, 2), upcCore: forms?.core, since });
      } catch {
        errors.push(agency);
        return [];
      }
    }),
  );
  const records = perAgency.flat();
  const capped = sources.filter((a, i) => perAgency[i].capped);
  const q = { terms: parsed.terms, extras: parsed.extras, upc: forms };
  const score = (allowMissing) =>
    records
      .map((r) => {
        const s = scoreRecord(q, analyze(r.fields), { allowMissing });
        return s && { ...r, confidence: s.confidence, matched: s.matched, missing: s.missing.length ? s.missing : undefined, _score: s.score };
      })
      .filter(Boolean);
  let matches = score(0);
  const near = !matches.length;
  if (near) matches = score(1);
  matches.sort(compareMatches);
  return {
    searched: sources.map((a) => AGENCIES[a]),
    unavailable: errors.length ? errors.map((a) => AGENCIES[a]) : undefined,
    candidates_checked: records.length,
    near_matches_only: near && matches.length ? true : undefined,
    upc_check_digit_ok: forms ? forms.checkOk : undefined,
    ignored_terms: parsed.dropped.length ? parsed.dropped : undefined,
    total: matches.length,
    more_may_exist: capped.length ? capped.map((a) => AGENCIES[a]) : undefined,
    results: matches.slice(0, MAX_RESULTS).map(presentRecord),
    truncated: matches.length > MAX_RESULTS ? matches.length - MAX_RESULTS : undefined,
  };
}
