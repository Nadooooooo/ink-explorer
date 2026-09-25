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

- collection routes: `stats`, `blocks`, `transactions`, `tokens`, `smart-contracts`, `token-transfers`, `internal-transactions`;
- a block by height or hash, and its transactions;
- a transaction by hash, plus its token transfers, internal transactions, logs, state changes or raw trace;
- an address by hash, plus balances, counters, transactions, tokens, NFTs, token transfers, internal transactions or logs;
- a smart contract by address;
- a token by address, plus transfers, holders and NFT instances or an instance's transfers;
- Optimism deposits and withdrawals; ERC-4337 operations.

`GET /api/stats/*` forwards read-only Stats Service paths using a restricted path character set. `GET /api/contract-info/pools` and `/api/contract-info/pools/:address[/check]` supply pool metadata. All upstream query strings are limited to 4096 characters. Invalid explorer or pool paths return HTTP 400. A failed upstream request normally returns HTTP 502; a recent, verified disk snapshot may be served instead for up to 24 hours.

Indexed responses keep the upstream JSON shape. Check the upstream API documentation before depending on a field, and handle missing fields: indexing can lag the current block.

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
