import { z } from "zod";
import { compact, defineTool } from "../kit/index.mjs";
import { AGENCIES, cpsc, fda } from "../sources.mjs";
import { presentRecord } from "../check.mjs";
import { READ_ONLY } from "./check-recalls.mjs";

export const recentRecalls = defineTool({
  name: "recent_recalls",
  title: "Recent recalls",
  description: "The newest US recalls from CPSC and FDA (food, drugs, devices) over the last N days (up to 90), newest first, optionally one agency only.",
  input: {
    days: z.number().int().min(1).max(90).optional().describe("Default 14"),
    agency: z.enum(Object.keys(AGENCIES)).optional(),
  },
  output: { since: z.string(), total: z.number(), results: z.array(z.looseObject({ agency: z.string(), id: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ days = 14, agency }, ctx) => {
    const since = new Date((ctx.now?.() ?? Date.now()) - days * 86_400_000).toISOString().slice(0, 10);
    const agencies = agency ? [agency] : Object.keys(AGENCIES);
    const lists = await Promise.all(agencies.map((a) => (a === "cpsc" ? cpsc(ctx, { since }).catch(() => []) : fda(ctx, a, { since, limit: 50 }).catch(() => []))));
    const all = lists.flat().filter((r) => !r.date || r.date >= since).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const fdaAsked = agencies.filter((a) => a !== "cpsc");
    const note = fdaAsked.length && !all.some((r) => r.agency !== "cpsc") ? "FDA publishes enforcement reports weekly and a week or two behind, so the newest FDA recalls may not be listed yet." : undefined;
    return { since, total: all.length, results: all.slice(0, 10).map(presentRecord), ...compact({ truncated: all.length > 10 ? all.length - 10 : undefined }), ...compact({ note }) };
  },
});
