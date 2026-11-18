# Security policy

## Reporting a vulnerability

Use **Security → Report a vulnerability** on GitHub to send a private report to the maintainers. Do not post vulnerability details, exploit steps or personal information in a public issue. Include the affected route or component, reproduction steps and impact in the private report. If the reporting button is unavailable, open a short issue asking for a private reporting channel without including the vulnerability itself.

## Trust boundaries

### Dependency verification

The Vite build and WalletConnect storage use the independently maintained `@ryotsu/picomatch@4.0.7-a`. Its parser changes the behavior originally reported as GHSA-fc5q-39xc-vjpf (CVE-2026-112366). GitHub withdrew the advisory on November 18, 2026, after the upstream maintainer disputed the report. During the transition the npm index still listed the original advisory against `picomatch <=4.0.7`. The explorer retains its tested parser configuration and pins the archive whose npm signatures and build provenance were verified against commit `3ab5a7627d480259e3d9ca67fbc14c125d374f0e`. Project filters were tested with the default safeguards, including the WalletConnect storage caller originally written for picomatch 2. Browser tests use Microsoft's `playwright-core` to avoid the additional parser bundled in the Playwright 1.63 test runner. [Withdrawn GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) · [Maintainer's explanation](https://github.com/micromatch/picomatch/pull/235#issuecomment-6315749381) · [Reviewed source](https://github.com/ryotsu-kankichi/secured-picomatch/tree/3ab5a7627d480259e3d9ca67fbc14c125d374f0e)

CI, the full release campaign and the weekly audit run the standard npm audit and check both npm and OSV for additional high or critical advisories on the original `picomatch@4.0.7`. The check separately retrieves the OSV record by ID to confirm its withdrawal, original CVE reference, package, affected range and severity. When an OSV replica returns the exact historical pre-withdrawal revision, the check requires the published OSV export to confirm the withdrawal. npm may retain or remove its original entry. A reopened advisory, changed scope, new high or critical advisory, or unavailable required feed fails the check. Replacing the fork requires retesting the Vite build, project filters and WalletConnect storage. [OSV record](https://api.osv.dev/v1/vulns/GHSA-fc5q-39xc-vjpf) · [Upstream check](scripts/audit-matcher-upstream.mjs) · [Scheduled audit](.github/workflows/dependency-audit.yml)

### Public requests and external data

The server serves public explorer data and accepts a small, validated set of read and simulation RPC methods at `POST /api/contract-rpc`. It does not accept signing or transaction broadcast methods. Contract writes are prepared in the browser and require confirmation in the visitor's own wallet. A successful simulation does not guarantee that a transaction will succeed onchain.

Blockscout, Contract Info, statistics, RPC responses, and NFT metadata are untrusted inputs. The media proxy fetches images and supported videos from public HTTPS destinations. It checks every redirect and pins the validated DNS address for each connection. Treat the media cache as untrusted, disposable data. See the download limits and preview behavior in the [media API reference](docs/API.md#media).

For a public deployment, terminate TLS at the edge, set `PUBLIC_URL` to the public HTTPS origin, keep local node RPC and metrics ports private, and review any change to the API allowlists or CSP. The default in-memory rate limit on contract RPC is per process and is not a substitute for edge rate limiting on a heavily trafficked deployment.
