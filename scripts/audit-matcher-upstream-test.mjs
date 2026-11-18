import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {verifyMatcherLock, verifyUpstreamAdvisories} from "./audit-matcher-upstream.mjs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const npmRecord = {
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  severity: "high", vulnerable_versions: "<=4.0.7",
};
const osvRecord = {
  id: "GHSA-fc5q-39xc-vjpf", modified: "2026-11-17T16:00:03.999173557Z",
  database_specific: {severity: "HIGH"},
};
const check = (npmRecords, osvRecords) => verifyUpstreamAdvisories({picomatch: npmRecords}, {vulns: osvRecords});

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

test("only the exact reviewed advisory revision and scope are covered", () => {
  check([npmRecord], [osvRecord]);
  assert.throws(() => check([], [osvRecord]), /withdrawn/);
  assert.throws(() => check([npmRecord], [{...osvRecord, withdrawn: "2026-11-18"}]), /withdrawn/);
  assert.throws(() => check([npmRecord], [{...osvRecord, modified: "later"}]), /revised/);
  assert.throws(() => check([{...npmRecord, vulnerable_versions: "*"}], [osvRecord]), /range/);
  assert.throws(() => verifyUpstreamAdvisories({}, {}), /malformed/);
});

test("either feed can surface a new high-severity upstream advisory", () => {
  assert.throws(() => check([npmRecord, {...npmRecord, url: "https://example.test/other"}], [osvRecord]), /npm advisory/);
  assert.throws(() => check([npmRecord], [osvRecord, {...osvRecord, id: "new", database_specific: {severity: "CRITICAL"}}]), /OSV advisory/);
  assert.throws(() => check([npmRecord], [osvRecord, {id: "unrated"}]), /severity/);
  check([npmRecord, {url: "https://example.test/other", severity: "low"}], [osvRecord]);
});
