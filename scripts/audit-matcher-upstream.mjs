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
const reviewedCve = "CVE-2026-112366";
const reviewedNpmId = 1247710;
const reviewedWithdrawal = "2026-11-18T15:38:56Z";
const lastActiveRevision = "2026-11-17T16:00:03.999173557Z";
const npmIndex = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const osvIndex = "https://api.osv.dev/v1/query";
const osvRecord = "https://api.osv.dev/v1/vulns/" + reviewedId;
const osvExport = "https://storage.googleapis.com/osv-vulnerabilities/npm/" + reviewedId + ".json";

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

function verifyOriginalScope(record) {
  assert.equal(record?.id, reviewedId, "Unexpected OSV advisory identity");
  // OSV can detach the active CVE alias after withdrawal. The historical NVD
  // advisory reference continues to identify the CVE on both published forms.
  const {aliases = []} = record;
  assert(Array.isArray(aliases) && aliases.length <= 1 && aliases.every(alias => alias === reviewedCve), "The reviewed OSV aliases changed");
  assert(record.references?.some(ref => ref.type === "ADVISORY" &&
    ref.url === "https://nvd.nist.gov/vuln/detail/" + reviewedCve), "Missing reviewed CVE reference");
  assert.equal(record.database_specific?.github_reviewed, true, "Missing GitHub review in the OSV record");
  assert.equal(record.database_specific.severity, "HIGH", "The reviewed OSV severity changed");
  assert.deepEqual(record.database_specific.cwe_ids, ["CWE-1333"], "The reviewed weakness changed");
  assert.equal(record.affected?.length, 1, "The reviewed OSV package scope changed");
  const [affected] = record.affected;
  assert.deepEqual(affected.package, {ecosystem: "npm", name: "picomatch", purl: "pkg:npm/picomatch"}, "The reviewed OSV package changed");
  assert.deepEqual(affected.ranges, [{type: "SEMVER", events: [{introduced: "0"}, {last_affected: upstreamVersion}]}], "The reviewed OSV range changed");
  if (affected.versions !== undefined) assert.deepEqual(affected.versions, [], "The reviewed OSV versions changed");
}

function verifyWithdrawal(record) {
  verifyOriginalScope(record);
  assert.equal(Date.parse(record.withdrawn), Date.parse(reviewedWithdrawal), "The reviewed OSV withdrawal changed or the advisory reopened");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function verifyUpstreamAdvisories(npm, osv, record) {
  // Empty package indexes alone cannot establish that an advisory was withdrawn.
  verifyWithdrawal(record);
  assert(isObject(npm) && Object.keys(npm).every(key => key === "picomatch") &&
    (!Object.hasOwn(npm, "picomatch") || Array.isArray(npm.picomatch)), "Malformed npm advisory feed");
  assert(Array.isArray(osv?.vulns), "Malformed OSV advisory feed");
  for (const item of npm.picomatch ?? []) {
    assert(typeof item?.url === "string" && item.url, "Missing npm advisory identity");
    if (item.url === reviewedUrl || item.id === reviewedNpmId) {
      // npm can retain its original record after GitHub and OSV withdraw it.
      assert.equal(item.url, reviewedUrl, "The reviewed npm advisory URL changed");
      assert.equal(item.id, reviewedNpmId, "The reviewed npm advisory identity changed");
      assert.equal(item.severity, "high", "The reviewed npm severity changed");
      assert.match(item.vulnerable_versions ?? "", /^<=\s*4\.0\.7$/, "The reviewed npm affected range changed");
    } else {
      assert(!requiresReview(item.severity), `Upstream npm advisory needs review: ${item.url}`);
    }
  }
  for (const item of osv.vulns) {
    assert(typeof item?.id === "string" && item.id, "Missing OSV advisory identity");
    if (item.id === reviewedId) verifyWithdrawal(item);
    else assert(!requiresReview(item.database_specific?.severity), `Upstream OSV advisory needs review: ${item.id}`);
  }
}

async function query(url, body) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? {"cache-control": "no-cache"} : {"content-type": "application/json"},
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
    assert(isObject(page) && Object.keys(page).every(key => key === "vulns" || key === "next_page_token"), "Malformed OSV advisory page");
    token = page.next_page_token;
    assert(token === undefined || typeof token === "string", "Malformed OSV pagination token");
    // OSV represents zero matches with {} and can also return a token-only page.
    assert(page.vulns === undefined || Array.isArray(page.vulns), "Malformed OSV advisory page");
    if (page.vulns) vulns.push(...page.vulns);
    assert(!seenTokens.has(token), "Repeated OSV pagination token");
    if (token) seenTokens.add(token);
  } while (token);
  return {vulns};
}

async function readReviewedRecord(read) {
  const record = await read(osvRecord);
  if (record?.withdrawn === undefined && record?.modified === lastActiveRevision) {
    // Replicas served this exact pre-withdrawal revision after the withdrawal.
    // Verify the current state using the same record in the published OSV export.
    verifyOriginalScope(record);
    return read(osvExport);
  }
  return record;
}

export async function auditUpstreamAdvisories(read = query) {
  const [npm, osv, record] = await Promise.all([
    read(npmIndex, {picomatch: [upstreamVersion]}),
    readOsvAdvisories(pageToken => read(osvIndex, {
      package: {name: "picomatch", ecosystem: "npm"}, version: upstreamVersion, page_token: pageToken,
    })),
    readReviewedRecord(read),
  ]);
  verifyUpstreamAdvisories(npm, osv, record);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  verifyMatcherLock(lock);
  await auditUpstreamAdvisories();
  console.log(`Verified ${forkName}@${forkVersion}, the withdrawal of ${reviewedId} and the npm and OSV indexes for picomatch@${upstreamVersion}.`);
}
