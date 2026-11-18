import assert from "node:assert/strict";
import { test } from "node:test";
import catalogue from "../src/ink-ecosystem.json" with { type: "json" };
import summariesFr from "../src/ink-ecosystem-fr.json" with { type: "json" };
import index from "../src/ink-ecosystem-index.json" with { type: "json" };
import { ecosystemAppId } from "../src/ink-ecosystem-route.ts";
import { defaultPageMetadata, explorerPageMetadata } from "../src/page-metadata.ts";
import { parseExplorerPath, pageStructuredData, canonicalExplorerPath, updatePageMetadata } from "../src/page-seo.ts";

test("route validation distinguishes real pages from malformed detail and extra segments", () => {
  const address = "0x" + "a".repeat(40);
  const hash = "0x" + "b".repeat(64);
  for (const path of ["/", "/search", "/blocks", "/verified-contracts", "/public-tags/submit", `/tx/${hash}`, `/op/${hash}`, `/block/${hash}`, "/block/100", `/address/${address}`, `/pools/${address}`, `/pools/${hash}`, `/token/${address}/instance/0`, `/token/${address}/instance/${2n ** 256n - 1n}`, "/batches/20", "/apps/bridge", "/stats/transactions", "/name-services/domains/example.eth"]) assert(parseExplorerPath(path), path);
  for (const path of ["/blocks/", "/txs/garbage", "/tokens/garbage", "/search/extra", "/public-tags", "/public-tags/nope", `/token/${address}/instance/`, `/token/${address}/instance/nope`, `/token/${address}/instance/-1`, `/token/${address}/instance/01`, `/token/${address}/instance/${2n ** 256n}`, `/tx/${address}`, `/address/${hash}`, `/token/${hash}`, `/approvals/${hash}`, `/pools/0x${"a".repeat(42)}`, `/pools/0x${"a".repeat(63)}`, `/pools/0x${"a".repeat(65)}`, "/name-services/domains/%zz", "/name-services/domains/%2F", "/stats/path.extra"]) assert.equal(parseExplorerPath(path), null, path);
  assert.deepEqual(parseExplorerPath("/name-services/domains/example.eth"), { name: "name-services", id: "domains/example.eth" });
});

test("official app identities, network availability and metadata agree with the catalogue", () => {
  assert.deepEqual(Object.keys(summariesFr), catalogue.map(app => app.id));
  assert.deepEqual(index, catalogue.map(({ id, name, network }) => ({ id, name, network })));
  assert.equal(new Set(catalogue.map(app => ecosystemAppId(app.id))).size, catalogue.length);
  for (const app of catalogue) {
    const id = ecosystemAppId(app.id), path = `/apps/${id}`;
    assert.deepEqual(parseExplorerPath(path), { name: "apps", id });
    assert(defaultPageMetadata(path)[0].startsWith(app.name + " · "));
    assert.equal(Boolean(parseExplorerPath(path, "/testnet")), app.network === "Both");
  }
  assert.equal(parseExplorerPath("/apps/ecosystem-unknown"), null);
  assert.match(explorerPageMetadata(new URL("https://inkexplorer.xyz/apps"), { basePath: "/testnet" })[1], /Ink Sepolia/);
});

test("structured data relates each locale and network page to its own website", () => {
  const graph = pageStructuredData({ origin: "https://inkexplorer.xyz", basePath: "/testnet", canonical: "https://inkexplorer.xyz/testnet/blocks?lang=fr", title: "Blocs", description: "Blocs Ink Sepolia", locale: "fr" })["@graph"];
  assert.equal(graph[0].url, "https://inkexplorer.xyz/testnet/");
  assert.equal(graph[1].url, "https://inkexplorer.xyz/testnet/blocks?lang=fr");
  assert.equal(graph[1].inLanguage, "fr");
  assert.equal(graph[1].isPartOf["@id"], graph[0]["@id"]);
});

test("block routes accept exactly the numeric identifier range used for record arrivals", () => {
  for (const id of ["0", "00000000000000000001", String(Number.MAX_SAFE_INTEGER)]) {
    assert.deepEqual(parseExplorerPath(`/block/${id}`), { name: "block", id });
  }
  for (const id of ["-1", "0".repeat(21), "9".repeat(80), String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.equal(parseExplorerPath(`/block/${id}`), null);
  }
});

test("only the statistics directory alias shares the analytics canonical", () => {
  for (const prefix of ["", "/testnet"]) {
    assert.equal(canonicalExplorerPath(`${prefix}/stats`, prefix), `${prefix}/analytics`);
    for (const path of ["/analytics", "/stats/newAccounts", "/stats/activeAccounts", "/apps/stats", "/missing/stats"]) {
      assert.equal(canonicalExplorerPath(prefix + path, prefix), prefix + path);
    }
  }
});

test("SPA canonical, alternates and structured data agree without changing the visited URL", () => {
  for (const basePath of ["", "/testnet"]) for (const locale of ["en", "fr", "ar"]) {
    const canonical = {}, graph = {}, metas = new Map();
    const alternates = ["en", "fr", "ar"].map(hreflang => ({ hreflang }));
    const doc = {
      documentElement: {}, head: { append() { assert.fail("Metadata elements already exist"); } },
      querySelector(selector) {
        if (selector === 'link[rel="canonical"]') return canonical;
        if (selector === "#ink-page-schema") return graph;
        if (!metas.has(selector)) metas.set(selector, {});
        return metas.get(selector);
      },
      querySelectorAll() { return alternates; },
    };
    const url = new URL(`https://inkexplorer.xyz${basePath}/stats?category=accounts&lang=${locale}#chart`), visited = url.href;
    updatePageMetadata({ doc, url, origin: url.origin, basePath, locale, title: "Statistics", description: "Chart directory", routeName: "stats", forceNoindex: false });
    const expected = `https://inkexplorer.xyz${basePath}/analytics${locale === "en" ? "" : `?lang=${locale}`}`;
    assert.equal(url.href, visited);
    assert.equal(canonical.href, expected);
    assert.equal(metas.get('meta[property="og:url"]').content, expected);
    assert.equal(JSON.parse(graph.textContent)["@graph"][1].url, expected);
    for (const alternate of alternates) assert.equal(alternate.href, `https://inkexplorer.xyz${basePath}/analytics${alternate.hreflang === "en" ? "" : `?lang=${alternate.hreflang}`}`);
  }
});
