# HTTP and WebSocket interface

The browser calls the same origin that served the page. Mainnet paths start with `/api`; Sepolia paths start with `/testnet/api`. The main worker forwards Sepolia requests to a separate loopback worker. JSON routes send `Cache-Control: no-store` to browsers even when the server uses its own short-lived cache.

This is the interface used by Ink Explorer. It is not a general replacement for Blockscout's API. The public index is the source of historical chain data. Local node health always describes the node configured for this instance.

## Health and overview

| Route | Returns |
| --- | --- |
| `GET /api/health` | Process uptime, live stream clients, sequence and sample time. `ok: true` means the HTTP process is answering; check `/api/network` for node health. |
| `GET /api/live/status` | Current stream state, head, client count and sample time. |
| `GET /api/overview` | Indexed stats, eight recent blocks, ten transactions, transaction chart, local network snapshot and source labels. |
| `GET /api/network` | Execution and rollup sync, heads, peers, gas, L1 relay and available disk measurements. |
| `GET /api/search?q=...` | Search matches from the indexed explorer; an empty query returns `items: []`. |

For example:

```bash
curl http://127.0.0.1:4188/api/overview
curl http://127.0.0.1:4188/testnet/api/network
```

The local node being unavailable does not make historical Blockscout pages unavailable. Network fields can be null or mark themselves unavailable. Do not infer node health from `GET /api/health` alone.

## Indexed reads

`GET /api/explorer/*` forwards only these Blockscout v2 shapes:

- collection routes: `stats`, `addresses`, `blocks`, `transactions`, `tokens`, `smart-contracts`, `token-transfers`, `internal-transactions`, `advanced-filters`;
- a block by height or hash, and its transactions;
- a transaction by hash, plus its token transfers, internal transactions, logs, state changes or raw trace;
- an address by hash, plus balances, counters, transactions, tokens, NFTs, token transfers, internal transactions, logs or coin-balance history (paged and daily);
- a smart contract by address, and verification configuration;
- a token by address, plus transfers, holders and NFT instances or an instance’s transfers and separate total transfer count;
- Optimism deposits, withdrawals, batches, games and their counts; blocks and transactions by batch; ERC-4337 operation lists and individual details.

`GET /api/stats/*` forwards read-only Stats Service paths using a restricted path character set. `GET /api/contract-info/pools` and `/api/contract-info/pools/:address[/check]` supply pool metadata. All upstream query strings are limited to 4096 characters. Invalid explorer or pool paths return HTTP 400. A failed upstream request normally returns HTTP 502; a recent, verified disk snapshot may be served instead for up to 24 hours during connection failures, rate limits or upstream server errors. Serving a fallback preserves its original fetch time; repeated outages cannot extend that lifetime. Permanent 4xx responses fail instead of resurrecting cached records.

Indexed responses keep the upstream JSON shape. Check the upstream API documentation before depending on a field, and handle missing fields: indexing can lag the current block.

Browser reads have a 20-second deadline covering both connection and JSON body. Address profiles reject a missing or different hash, show an error and allow retry without leaving the address. Navigation cancels obsolete profile requests. Failed holdings/counter requests remain visibly unavailable rather than being shown as zero. Advanced-filter reads allow 75 seconds to preserve the upstream query budget.

Network snapshots also include `derivation`: `online`, `synced`, `l1Block`, `l1Head`, `lag` and `ageSeconds`. `synced` at the top level describes the execution head; `derivation.synced` describes independent L1 processing. A live execution head does not prove that safe/finalized validation is progressing. Overall network health remains degraded if derivation is unavailable, more than 150 L1 blocks behind, or more than 30 minutes behind the reported L1 head. A stale, future-dated or incoherent L1 head also fails readiness.

Advanced filters preserve the Blockscout query and cursor parameters. Amount bounds are decimal ETH or token units, not wei. Queries can take up to 65 seconds; the Sepolia proxy allows 70 seconds. A filtered query never falls back to an expired disk snapshot after an upstream failure. Successful pages have a short (15-second) cache. CSV output remains a browser operation and uses raw amounts.

## Wallet-safe contract RPC

`POST /api/contract-rpc` accepts JSON with `method` and `params`. Allowed methods are `eth_chainId`, `eth_blockNumber`, `eth_getTransactionReceipt`, `eth_getCode`, `eth_call` and `eth_estimateGas`. Calls and estimates require a valid contract address, bounded calldata and transaction fields from a fixed allowlist. Calls use the `latest` block. The server checks the RPC chain ID, rejects cross-origin browser requests and limits queries per client address.

```bash
curl -X POST http://127.0.0.1:4188/api/contract-rpc \
  -H 'content-type: application/json' \
  -d '{"method":"eth_getCode","params":["0x4200000000000000000000000000000000000006","latest"]}'
```

A successful response contains the JSON-RPC result plus `source` (`local` or `public`) and `chainId`. The public fallback is used only for reads and simulation when the local node is not ready. Signing and transaction broadcast methods are never accepted here. Contract writes in the UI are handed to the visitor's wallet after simulation and explicit confirmation.

## Media

`GET /api/media?url=...` fetches HTTPS token and NFT images into the local cache. It rejects private IP ranges, validates each redirect, pins the checked DNS address for the connection, accepts a small image type list and stops at 8 MB. Cache hits return `X-Media-Cache: HIT`; a new fetch returns `MISS`. Treat remote artwork and metadata as untrusted.

## Live stream

Connect to `WS /api/live` or `WS /testnet/api/live`. Frames use protocol `ink-observer.live.v1`. A client first receives a `welcome` frame after the first local sample. Subsequent `network` frames report status; `block` frames indicate a new local head. Each frame has a monotonic process-local `sequence`, `sentAt`, `network`, `block` and `transactions`. The server sends WebSocket heartbeats and accepts the text `ping`, replying with a small `pong` JSON frame. Reconnect after a close and use the snapshot to restore state; sequence numbers do not survive a process restart.

The `ink-observer.live.v1` protocol identifier is retained for existing clients after the Ink Explorer rename. Do not infer the public project name from that identifier.

The stream is sampled from the configured local nodes. If they are missing or syncing, it will not invent blocks from the public explorer index.

## Address balance provenance

For `GET /api/explorer/addresses/{address}`, address metadata remains from the Ink index. When possible, the ETH `coin_balance` is checked against the local node at `block_number_balance_updated_at`. The node must report the expected chain, complete sync and a fresh execution head. The balance read uses EIP-1898 `{blockHash, requireCanonical: true}`, binding it to one canonical block rather than a moving height. The complete verification has a five-second deadline.

`balance_check` reports `matched` or `corrected`, `source: "local"`, the original `indexed_balance`, `block_number`, `block_hash` and `checked_at`. A disagreement replaces the displayed amount with the exact node balance and is shown explicitly in the interface. If the node is unavailable, stale, on another chain, lacks the historical block, or rejects the canonical read, the index amount remains available with `balance_check.status: "unavailable"`; the interface labels it unverified. This does not imply that token balances, counters or contract metadata have been verified by the node.

An OP Node `current_l1` cursor can be one block ahead of its perceived `head_l1`. That is considered coherent only when both block hashes are valid and distinct, the cursor's `parentHash` matches the observed head hash, and the cursor timestamp is newer. Raw heights remain unchanged in the response. Missing ancestry, forks at an equal height, larger ahead gaps, stale observations and future timestamps cannot claim readiness. The 150-block and 30-minute behind limits are unchanged. See the upstream [SyncStatus definition](https://pkg.go.dev/github.com/ethereum-optimism/optimism@v1.19.6/op-service/eth#SyncStatus).

## Names, Dapps and publication forms

`GET /api/names/protocols`, `/domains:lookup`, `/addresses:lookup`, `/domains/:name` and
`/domains/:name/events` use the fixed BENS service. Protocol discovery retains ENS
and protocols deployed for the selected Ink network. Lookup queries use `protocols`; individual domains and their events use
`protocol_id`. Mainnet Ink names use `zns-ink`. Registration can occur on another
chain, so its transactions are not linked as Ink transactions. Encoded path
separators and traversal names are rejected.

`GET /api/dapps` returns the selected chain’s marketplace catalogue. External
application websites must be HTTPS; official explorer destinations are filtered
from visitor-facing actions.

`POST /api/verification/submit` requires JSON, an address and `consent: true`.
The bounded request accepts a supported method (`standard-input`,
`vyper-standard-input`, `flattened-code`, `vyper-code`, `multi-part`,
`vyper-multi-part`, `sourcify`), compiler version, license and original sources.
Compiler input is capped at 2 MiB. Multipart uploads use an inline `sources`
object; single-file inputs are source text. Standard JSON keeps all compilation
settings. Sourcify requires the address and consent without source upload.

The server sends only the method’s compiler payload to the fixed verification
service. It returns HTTP 202 with a random ticket. `GET
/api/verification/status/:ticket` reports `pending`, `verified` or `failed`.
Phoenix verification events supply completion. Jobs expire after 15 minutes;
live subscriptions last at most two minutes. The browser stops automatic polling
after one minute and offers a further check or the local source page. A queued
request is never reported as verified. These routes do not sign or broadcast.

`GET /api/public-tags/types` lists supported types. `POST
/api/public-tags/submit` accepts the company/contact fields, address, label,
comment and explicit consent; up to 20 labels can be proposed together. Optional
label links/icons must be HTTPS, colors must be six-digit hex, and public
descriptions are bounded. HTTP 202 is an acknowledgement of a pending proposal.
There is no public queue endpoint. Contacts are stored in mode-0600 files under
`data/community-tags/<chain-id>/requests`, outside Git and the served frontend.
Only operator approval adds public profile metadata. Rejection never adds a tag.
Concurrent moderation is serialized, retaining all approved labels. Operator
instructions are in the README. These labels are this instance’s decisions,
not statements of verification or endorsements by the public index.

Publication forms accept only same-origin browsers or `EXPLORER_BROWSER_ORIGIN`.
They have bounded bodies, upstream deadlines and per-client rate limits. All
actual publication tests use temporary stores and mock upstream services.

The native `/api/explorer/stats?gas_oracle=updated` response requests the updated gas oracle and
contains per-priority wei, inclusion time and priority-fee data. Its cache is
isolated from the legacy numeric gas estimates used in `/api/overview`.

Without `gas_oracle=updated`, the stats endpoint preserves the legacy numeric
gas-price shape for existing clients. The detailed and legacy responses use
separate caches, including when both are requested during a rolling update.

## Public deployment and approvals

Static Vercel deployments forward `/api/*` and `/testnet/api/*` through a fixed operator-configured public HTTPS origin. `/api/live/config` provides the public WebSocket URL; `/api/live/snapshot` returns the same network/block/transaction frame over HTTP when WebSockets are unavailable. Both networks remain scoped by the path.

- `GET /api/approvals/:owner/events?from=0&to=...&snapshot=...`: standard owner-indexed approval events, collapsed by permission within the scanned range. `next` is a contiguous continuation when a saturated range had to be split. Follow all continuations and collapse newer events across ranges before checking state. An unsplittable saturated block fails instead of claiming complete discovery.
- `POST /api/approvals/:owner/state` with `{ "items": [...] }`: up to 12 validated ERC-20, individual ERC-721 or operator permission records. Returns exact decimal amounts, boolean/unknown status, canonical block/hash, source and chain ID. Operator standard is checked through ERC-165; metadata failure does not invent decimals. Reads are bounded, rate limited and never cached as current permissions.

There is no server-side revoke/broadcast endpoint. Simulation uses the existing restricted contract RPC; signing and transmission happen only in the owner’s wallet. Permit2 and non-standard/unindexed events are outside the discovery scope.
