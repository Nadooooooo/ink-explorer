# Security policy

## Reporting a vulnerability

Use **Security → Report a vulnerability** on GitHub to send a private report to the maintainers. Do not post vulnerability details, exploit steps or personal information in a public issue. Include the affected route or component, reproduction steps and impact in the private report. If the reporting button is unavailable, open a short issue asking for a private reporting channel without including the vulnerability itself.

## Trust boundaries

### Dependency verification

The Vite build and WalletConnect storage resolve their glob matcher to the independently maintained `@ryotsu/picomatch@4.0.7-a`. This release changes the parser behavior covered by GHSA-fc5q-39xc-vjpf. The lockfile pins the exact archive whose npm signatures and build provenance were checked against source commit `3ab5a7627d480259e3d9ca67fbc14c125d374f0e`. The explorer uses the default parser safeguards. Project filters were checked against the replacement, including the storage caller originally written for picomatch 2. The browser tools use Microsoft's `playwright-core` package to avoid the extra parser bundled in the Playwright 1.63 test runner. [Reviewed source](https://github.com/ryotsu-kankichi/secured-picomatch/tree/3ab5a7627d480259e3d9ca67fbc14c125d374f0e) · [Advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

CI and the full release campaign run the normal npm audit and separately query npm and OSV for the original `picomatch@4.0.7` package. The additional check verifies the locked archive and requires review for a new high-severity advisory or any revision of the advisory covered by this correction. The scheduled workflow repeats both checks weekly. Reassess the override when upstream ships a correction, when the archive or advisory changes, or before adding filters that rely on different glob semantics. Replacing the fork requires retesting both the build and WalletConnect storage. [Upstream check](scripts/audit-matcher-upstream.mjs) · [Scheduled audit](.github/workflows/dependency-audit.yml)

### Public requests and external data

The server serves public explorer data and accepts a small, validated set of read and simulation RPC methods at `POST /api/contract-rpc`. It does not accept signing or transaction broadcast methods. Contract writes are prepared in the browser and require confirmation in the visitor's own wallet. A successful simulation does not guarantee that a transaction will succeed onchain.

Blockscout, Contract Info, statistics, RPC responses, and NFT metadata are untrusted inputs. The media proxy fetches images and supported videos from public HTTPS destinations. It checks every redirect and pins the validated DNS address for each connection. Treat the media cache as untrusted, disposable data. See the download limits and preview behavior in the [media API reference](docs/API.md#media).

For a public deployment, terminate TLS at the edge, set `PUBLIC_URL` to the public HTTPS origin, keep local node RPC and metrics ports private, and review any change to the API allowlists or CSP. The default in-memory rate limit on contract RPC is per process and is not a substitute for edge rate limiting on a heavily trafficked deployment.
