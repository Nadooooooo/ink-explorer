import assert from "node:assert/strict";
import catalogue from "../src/ink-ecosystem.json" with { type: "json" };
import localeMeta from "../src/locales/meta.json" with { type: "json" };
import { ecosystemAppId } from "../src/ink-ecosystem-route.ts";

const directories = [
  "/", "/blocks", "/txs", "/tokens", "/pools", "/contracts", "/analytics", "/advanced",
  "/developers", "/network", "/accounts", "/internal-txs", "/token-transfers", "/deposits",
  "/withdrawals", "/batches", "/dispute-games", "/ops", "/name-services", "/gas-tracker",
  "/apps", "/contract-verification", "/public-tags/submit", "/approvals",
];

/** Compare the advertised URLs with the full directory, independently of the compact routing index. */
export function assertPublicSitemap(xml, origin, prefix) {
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  const listed = new Set(locations);
  const apps = catalogue.filter(app => prefix !== "/testnet" || app.network === "Both");
  const paths = [...directories, ...apps.map(app => `/apps/${ecosystemAppId(app.id)}`)];
  assert.equal(listed.size, locations.length, "Duplicate sitemap location");
  assert.equal(locations.length, paths.length * localeMeta.locales.length, "Unexpected sitemap coverage");
  for (const path of paths) {
    for (const language of localeMeta.locales) {
      const url = new URL(prefix + path, origin);
      if (language !== "en") url.searchParams.set("lang", language);
      assert(listed.has(url.href), `Missing canonical sitemap location: ${url.href}`);
    }
  }
  return locations.length;
}
