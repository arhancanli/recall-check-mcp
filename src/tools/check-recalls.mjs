import { z } from "zod";
import { compact, defineTool, ToolError } from "../kit/index.mjs";
import { searchAgencies } from "../check.mjs";
import { AGENCIES } from "../sources.mjs";

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export const checkRecalls = defineTool({
  name: "check_recalls",
  title: "Check a product for recalls",
  description: "Searches US recalls for a product by name, brand, model number or UPC across CPSC consumer products and FDA food, drugs and devices in one call. Each match has a confidence (exact, high, medium, low), the hazard or reason, remedy and date. No match is not proof of safety.",
  input: {
    query: z.string().min(2).max(200).optional().describe("Product, brand or model"),
    upc: z.string().min(8).max(20).optional().describe("Barcode digits"),
    sources: z.array(z.enum(Object.keys(AGENCIES))).min(1).max(4).optional(),
    since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).max(10).optional().describe("YYYY-MM-DD"),
  },
  output: { searched: z.array(z.string()), total: z.number(), results: z.array(z.looseObject({ agency: z.string(), id: z.string(), confidence: z.string() })) },
  annotations: READ_ONLY,
  handler: async ({ query, upc, sources, since }, ctx) => {
    if (!query && !upc) throw new ToolError("missing_query", "Give a product name, brand or model number, or a UPC.");
    const out = await searchAgencies(ctx, { query, upc, sources, since });
    const note = out.note ?? (out.total === 0 ? "No recall matched in the agencies searched. That is not proof the product is safe: check the brand's own notices, and use vehicle_recalls for vehicles." : undefined);
    return { searched: out.searched, total: out.total, results: out.results, ...compact({ ...out, searched: undefined, total: undefined, results: undefined, note }) };
  },
});
