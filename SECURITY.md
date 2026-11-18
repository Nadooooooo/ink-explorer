# Security policy

## Reporting a vulnerability

Use **Security → Report a vulnerability** on GitHub to send a private report to the maintainers. Do not post vulnerability details, exploit steps or personal information in a public issue. Include the affected route or component, reproduction steps and impact in the private report. If the reporting button is unavailable, open a short issue asking for a private reporting channel without including the vulnerability itself.

## Trust boundaries

The server serves public explorer data and accepts a small, validated set of read and simulation RPC methods at `POST /api/contract-rpc`. It does not accept signing or transaction broadcast methods. Contract writes are prepared in the browser and require confirmation in the visitor's own wallet. A successful simulation does not guarantee that a transaction will succeed onchain.

Blockscout, Contract Info, statistics, RPC responses, and NFT metadata are untrusted inputs. The media proxy fetches images and supported videos from public HTTPS destinations. It checks every redirect and pins the validated DNS address for each connection. Treat the media cache as untrusted, disposable data. See the download limits and preview behavior in the [media API reference](docs/API.md#media).

For a public deployment, terminate TLS at the edge, set `PUBLIC_URL` to the public HTTPS origin, keep local node RPC and metrics ports private, and review any change to the API allowlists or CSP. The default in-memory rate limit on contract RPC is per process and is not a substitute for edge rate limiting on a heavily trafficked deployment.
