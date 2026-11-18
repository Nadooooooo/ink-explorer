import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {fileURLToPath} from "node:url";

// npm audits the installed package name. Also follow advisories for the
// original parser until a reviewed upstream release can replace this fork.
const upstreamVersion = "4.0.7";
const forkName = "@ryotsu/picomatch";
const forkVersion = "4.0.7-a";
const archive = "https://registry.npmjs.org/@ryotsu/picomatch/-/picomatch-4.0.7-a.tgz";
const integrity = "sha512-JroBFEmaejC7szGSfqOhF1QZHLKvX2wTA1+fWyfkpy3BjzdQKNPLKa2FtgeKVUDy5/UPUNkXEeCHJ5ZRBMLTVA==";
const reviewedId = "GHSA-fc5q-39xc-vjpf";
const reviewedUrl = "https://github.com/advisories/" + reviewedId;
const reviewedRevision = "2026-11-17T16:00:03.999173557Z";

export function verifyMatcherLock(lock) {
  const entries = Object.entries(lock.packages);
  const matchers = entries.filter(([path, pkg]) => path.endsWith("/picomatch") || pkg.name === forkName || pkg.name === "picomatch");
  assert(matchers.length > 0, "Reviewed matcher missing from package-lock.json");
  for (const [path, pkg] of matchers) {
    assert.equal(pkg.name, forkName, `Unreviewed matcher in ${path}`);
    assert.equal(pkg.version, forkVersion, `Unreviewed matcher version in ${path}`);
    assert(!pkg.link && pkg.resolved === archive, `Unreviewed matcher source in ${path}`);
    assert.equal(pkg.integrity, integrity, `Unreviewed matcher archive in ${path}`);
  }
  assert(!entries.some(([path, pkg]) => (path.endsWith("/playwright") || pkg.name === "playwright") && pkg.version === "1.63.0"),
    "playwright@1.63.0 embeds another upstream parser in its test runner");
}

function requiresReview(level) {
  const severity = level?.toLowerCase();
  assert(["info", "low", "moderate", "medium", "high", "critical"].includes(severity), "Unknown upstream advisory severity");
  return severity === "high" || severity === "critical";
}

export function verifyUpstreamAdvisories(npm, osv) {
  assert(Array.isArray(npm.picomatch) && Array.isArray(osv.vulns), "Upstream advisory feed missing or malformed");
  const registryRecord = npm.picomatch.find(item => item.url === reviewedUrl);
  const osvRecord = osv.vulns.find(item => item.id === reviewedId);
  assert(registryRecord && osvRecord, "The upstream advisory changed or was withdrawn. Reassess the fork");
  assert.equal(registryRecord.severity, "high", "The reviewed npm severity changed");
  assert.equal(registryRecord.vulnerable_versions, "<=4.0.7", "The reviewed npm affected range changed");
  assert.equal(osvRecord.modified, reviewedRevision, "The upstream advisory was revised. Review the current correction");
  assert.equal(osvRecord.database_specific?.severity, "HIGH", "The reviewed OSV severity changed");
  assert(!osvRecord.withdrawn, "The upstream advisory was withdrawn. Reassess the fork");
  for (const item of npm.picomatch) {
    assert(!requiresReview(item.severity) || item.url === reviewedUrl, `Upstream npm advisory needs review: ${item.url}`);
  }
  for (const item of osv.vulns) {
    assert(!requiresReview(item.database_specific?.severity) || item.id === reviewedId, `Upstream OSV advisory needs review: ${item.id}`);
  }
}

async function query(url, body) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === 2) throw new Error(`Could not read ${new URL(url).hostname}: ${error.message}`, {cause: error});
      await delay(750);
    }
  }
}

export async function readOsvAdvisories(readPage) {
  const vulns = [];
  const seenTokens = new Set();
  let token;
  do {
    const page = await readPage(token);
    token = page.next_page_token;
    assert(token === undefined || typeof token === "string", "Malformed OSV pagination token");
    // OSV can return only a continuation token when a page takes too long.
    assert(Array.isArray(page.vulns) || (page.vulns === undefined && token), "Malformed OSV advisory page");
    if (page.vulns) vulns.push(...page.vulns);
    assert(!seenTokens.has(token), "Repeated OSV pagination token");
    if (token) seenTokens.add(token);
  } while (token);
  return {vulns};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  verifyMatcherLock(lock);
  const [npm, osv] = await Promise.all([
    query("https://registry.npmjs.org/-/npm/v1/security/advisories/bulk", {picomatch: [upstreamVersion]}),
    readOsvAdvisories(pageToken => query("https://api.osv.dev/v1/query", {
      package: {name: "picomatch", ecosystem: "npm"}, version: upstreamVersion, page_token: pageToken,
    })),
  ]);
  verifyUpstreamAdvisories(npm, osv);
  console.log(`Verified the locked ${forkName}@${forkVersion} and the current npm and OSV records for picomatch@${upstreamVersion}.`);
}
