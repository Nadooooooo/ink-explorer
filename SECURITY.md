# Security policy

## Reporting a vulnerability

When this repository is public, use **Security → Report a vulnerability** on GitHub. Maintainers must enable private vulnerability reporting before public release. If that option is unavailable, open an issue asking for a private reporting channel without including the vulnerability, exploit steps or personal information. Include the affected route or component, reproduction steps and impact only in the private report.

## Trust boundaries

The server serves public explorer data and accepts a small, validated set of read and simulation RPC methods at `POST /api/contract-rpc`. It does not accept signing or transaction broadcast methods. Contract writes are prepared in the browser and require confirmation in the visitor's own wallet. A successful simulation does not guarantee that a transaction will succeed onchain.

Blockscout, Contract Info, statistics, RPC responses and NFT metadata are untrusted inputs. The media proxy accepts public HTTPS images, checks every redirect, pins the validated DNS answer during each connection, limits downloads to 8 MB and rejects active SVG features. Treat the media cache as untrusted, disposable data.

For a public deployment, terminate TLS at the edge, set `PUBLIC_URL` to the public HTTPS origin, keep local node RPC and metrics ports private, and review any change to the API allowlists or CSP. The default in-memory rate limit on contract RPC is per process and is not a substitute for edge rate limiting on a heavily trafficked deployment.
