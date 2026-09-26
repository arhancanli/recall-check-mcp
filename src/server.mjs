#!/usr/bin/env node
// recall-check: Checks US product recalls across agencies in one call: CPSC consumer products, FDA food, drugs and devices, USDA FSIS meat and poultry, and NHTSA vehicles, tires and car seats, matched by name, brand, model number, UPC or VIN.
//
// Tools live in src/tools/, one file each. The kit in src/kit/ is a copy of the factory kit
// (a drift test keeps it identical); it holds the network guard, the result wrapper and the
// stdio and HTTP entry points.
import { readFileSync } from "node:fs";
import { createFetcher, createServer, isMain, start, TtlCache } from "./kit/index.mjs";
import { HOSTS, LIMITS } from "./sources.mjs";
import { checkRecalls } from "./tools/check-recalls.mjs";
import { recentRecalls } from "./tools/recent-recalls.mjs";
import { vehicleRecalls } from "./tools/vehicle-recalls.mjs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export const SERVER_NAME = pkg.name;
export const SERVER_VERSION = pkg.version;
export const TOOLS = [checkRecalls, recentRecalls, vehicleRecalls];

export const INSTRUCTIONS =
  "Use check_recalls for any consumer product, food, drug or medical device (by name, brand, model number or UPC), vehicle_recalls for cars and trucks, recent_recalls for what was recalled lately. A match carries a confidence; confirm model numbers and dates against the agency's notice. No match is not proof a product is safe. USDA meat and poultry recalls are not covered.";

export function createContext({ fetchImpl, now } = {}) {
  return {
    now,
    fetcher: createFetcher({
      allowHosts: pkg.factory.allowHosts,
      userAgent: `${SERVER_NAME}/${SERVER_VERSION} (+${pkg.homepage})`,
      cache: new TtlCache({ ttlMs: 60 * 60_000, maxEntries: 500 }),
      limits: LIMITS,
      timeoutMs: 30_000,
      attemptTimeoutMs: 12_000,
      maxBytes: 16 * 1024 * 1024,
      fetchImpl,
    }),
  };
}

if (HOSTS.some((h) => !pkg.factory.allowHosts.includes(h))) throw new Error("package.json factory.allowHosts must list every source host");

export function buildServer(ctx = createContext()) {
  return createServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: INSTRUCTIONS, tools: TOOLS, ctx });
}

if (isMain(import.meta.url)) start(() => buildServer(), SERVER_NAME);
