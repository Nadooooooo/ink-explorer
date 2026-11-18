import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {auditUpstreamAdvisories, readOsvAdvisories, verifyMatcherLock, verifyUpstreamAdvisories} from "./audit-matcher-upstream.mjs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const npmRecord = {
  id: 1247710,
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  severity: "high", vulnerable_versions: "<=4.0.7",
};
const osvRecord = {
  id: "GHSA-fc5q-39xc-vjpf", aliases: ["CVE-2026-112366"],
  modified: "2026-11-18T15:45:04.146348855Z", withdrawn: "2026-11-18T15:38:56Z",
  database_specific: {github_reviewed: true, severity: "HIGH", cwe_ids: ["CWE-1333"]},
  references: [{type: "ADVISORY", url: "https://nvd.nist.gov/vuln/detail/CVE-2026-112366"}],
  affected: [{
    package: {name: "picomatch", ecosystem: "npm", purl: "pkg:npm/picomatch"},
    ranges: [{type: "SEMVER", events: [{introduced: "0"}, {last_affected: "4.0.7"}]}],
  }],
};
const {withdrawn, ...activeRecord} = osvRecord;
const check = (npmRecords, osvRecords, record = osvRecord) => verifyUpstreamAdvisories({picomatch: npmRecords}, {vulns: osvRecords}, record);
const npmUrl = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const packageUrl = "https://api.osv.dev/v1/query";
const recordUrl = "https://api.osv.dev/v1/vulns/GHSA-fc5q-39xc-vjpf";
const exportUrl = "https://storage.googleapis.com/osv-vulnerabilities/npm/GHSA-fc5q-39xc-vjpf.json";
const responses = {[npmUrl]: {}, [packageUrl]: {}, [recordUrl]: osvRecord};

test("the current lock pins every installed matcher to the reviewed archive", () => {
  verifyMatcherLock(lock);
  const changed = structuredClone(lock);
  const matcher = Object.values(changed.packages).find(pkg => pkg.name === "@ryotsu/picomatch");
  matcher.integrity = "different-archive";
  assert.throws(() => verifyMatcherLock(changed), /archive/);
  for (const change of [{link: true}, {resolved: "file:another-source"}]) {
    const other = structuredClone(lock);
    Object.assign(Object.values(other.packages).find(pkg => pkg.name === "@ryotsu/picomatch"), change);
    assert.throws(() => verifyMatcherLock(other), /source/);
  }
  const nested = structuredClone(lock);
  nested.packages["node_modules/anymatch/node_modules/picomatch"] = {version: "2.3.2"};
  assert.throws(() => verifyMatcherLock(nested), /Unreviewed matcher/);
  const wrapper = structuredClone(lock);
  wrapper.packages["node_modules/playwright"] = {version: "1.63.0"};
  assert.throws(() => verifyMatcherLock(wrapper), /embeds/);
});

test("a verified withdrawal permits a stale npm record and subsequent empty indexes", async () => {
  check([npmRecord], []);
  check([], [osvRecord]);
  check([], [], {...osvRecord, modified: "2026-11-20T01:02:03Z", aliases: undefined});
  check([], [], {...osvRecord, aliases: []});
  verifyUpstreamAdvisories({}, {vulns: []}, osvRecord);
  await auditUpstreamAdvisories(async (url, body) => {
    assert(Object.hasOwn(responses, url), "Unexpected advisory endpoint");
    if (url === npmUrl) assert.deepEqual(body, {picomatch: ["4.0.7"]});
    if (url === packageUrl) assert.deepEqual(body.package, {name: "picomatch", ecosystem: "npm"});
    if (url === packageUrl) assert.equal(body.version, "4.0.7");
    if (url === recordUrl) assert.equal(body, undefined);
    return responses[url];
  });
});

test("the reviewed OSV withdrawal, advisory identity and affected range must still match", () => {
  assert.throws(() => verifyUpstreamAdvisories({}, {vulns: []}, {}), /identity/);
  assert.throws(() => check([], [], activeRecord), /reopened/);
  assert.throws(() => check([], [activeRecord]), /reopened/);
  assert.throws(() => check([], [], {...osvRecord, withdrawn: "2026-11-19T15:38:56Z"}), /withdrawal/);
  assert.throws(() => check([], [], {...osvRecord, aliases: ["CVE-other"]}), /aliases/);
  assert.throws(() => check([], [], {...osvRecord, references: []}), /CVE reference/);
  assert.throws(() => check([], [], {...osvRecord, database_specific: {...osvRecord.database_specific, severity: "CRITICAL"}}), /severity/);
  assert.throws(() => check([], [], {...osvRecord, affected: []}), /scope/);
  const [affected] = osvRecord.affected;
  for (const [change, error] of [
    [{package: {...affected.package, name: "different"}}, /package/],
    [{ranges: [{type: "SEMVER", events: [{introduced: "0"}]}]}, /range/],
    [{versions: ["5.0.0"]}, /versions/],
  ]) assert.throws(() => check([], [], {...osvRecord, affected: [{...affected, ...change}]}), error);
  assert.throws(() => check([{...npmRecord, id: 0}], []), /identity/);
  assert.throws(() => check([{...npmRecord, url: "https://example.test/other"}], []), /URL/);
  assert.throws(() => check([{...npmRecord, vulnerable_versions: "*"}], []), /range/);
  assert.throws(() => check([{...npmRecord, severity: "moderate"}], []), /severity/);
});

test("either feed can surface a new high-severity upstream advisory", () => {
  assert.throws(() => check([npmRecord, {...npmRecord, id: 1, url: "https://example.test/other"}], []), /npm advisory/);
  assert.throws(() => check([npmRecord], [osvRecord, {...osvRecord, id: "new", database_specific: {severity: "CRITICAL"}}]), /OSV advisory/);
  assert.throws(() => check([npmRecord], [osvRecord, {id: "unrated"}]), /severity/);
  check([npmRecord, {url: "https://example.test/other", severity: "low"}], [osvRecord]);
});

test("OSV pagination checks later advisories and rejects malformed continuations", async () => {
  const critical = {...osvRecord, id: "later", database_specific: {severity: "CRITICAL"}};
  const pages = new Map([
    [undefined, {vulns: [osvRecord], next_page_token: "second"}],
    ["second", {next_page_token: "third"}],
    ["third", {vulns: [critical]}],
  ]);
  const all = await readOsvAdvisories(token => pages.get(token));
  assert.deepEqual(all.vulns, [osvRecord, critical]);
  assert.throws(() => verifyUpstreamAdvisories({picomatch: [npmRecord]}, all, osvRecord), /OSV advisory/);
  await assert.rejects(readOsvAdvisories(() => ({next_page_token: "repeated"})), /Repeated/);
  await assert.rejects(readOsvAdvisories(() => ({next_page_token: 9})), /Malformed/);
  assert.deepEqual(await readOsvAdvisories(() => ({})), {vulns: []});
});

test("only the documented stale API revision permits consulting the official OSV export", async () => {
  const historical = {...activeRecord, modified: "2026-11-17T16:00:03.999173557Z"};
  const pages = {...responses, [recordUrl]: historical, [exportUrl]: osvRecord};
  const seen = [];
  await auditUpstreamAdvisories(url => { seen.push(url); return pages[url]; });
  assert(seen.includes(exportUrl));
  await assert.rejects(auditUpstreamAdvisories(url => url === exportUrl ? activeRecord : pages[url]), /reopened/);
  await assert.rejects(auditUpstreamAdvisories(url => url === recordUrl ? activeRecord : pages[url]), /reopened/);
  await assert.rejects(auditUpstreamAdvisories(url => url === recordUrl ? {...historical, aliases: ["CVE-other"]} : pages[url]), /aliases/);
});

test("an unavailable or malformed feed cannot certify package indexes as empty", async () => {
  const historical = {...activeRecord, modified: "2026-11-17T16:00:03.999173557Z"};
  for (const endpoint of [npmUrl, packageUrl, recordUrl, exportUrl]) {
    await assert.rejects(auditUpstreamAdvisories(async url => {
      if (url === endpoint) throw Error("feed unavailable");
      return url === recordUrl ? historical : responses[url];
    }), /unavailable/);
  }
  for (const malformed of [null, [], {message: "unavailable"}, {vulns: null}]) {
    await assert.rejects(readOsvAdvisories(() => malformed), /Malformed/);
  }
  for (const malformed of [null, [], {error: "unavailable"}, {picomatch: null}]) {
    assert.throws(() => verifyUpstreamAdvisories(malformed, {vulns: []}, osvRecord), /Malformed/);
  }
});
