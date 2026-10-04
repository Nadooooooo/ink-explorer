# Native explorer comparison

This comparison uses the public navigation and detail pages of the Ink explorer,
plus the APIs actually requested by those pages. The reference was inspected in
a browser on 3 October 2026 at desktop and mobile sizes. Twenty-six public routes
and the address, contract, token, transaction, batch, operation and NFT tabs were
captured. Additional checks cover chart and name details, verification methods,
address menus and account navigation. Generated captures and upstream source
references remain outside Git under `reports/`.

The current implementation keeps explorer navigation inside this application.
The upstream index remains the source of indexed history. External application
websites and Ink documentation remain available where appropriate; official
explorer URLs supplied by metadata are excluded from visitor-facing actions and
wallet explorer configuration.

## Page families and useful information

| Official page family | Native destination | Information and interactions checked |
| --- | --- | --- |
| Home | `/` | Latest blocks/transactions, chain status, search, gas and totals. |
| Blocks | `/blocks`, `/block/:id` | Hashes, parents, timestamps, finality evidence, gas, exact total fees and paged transactions. |
| Transactions | `/txs`, `/tx/:hash` | Inclusion versus success/pending/revert; addresses, exact ETH amounts, gas and L1/L2 fee separation. |
| Internal transactions | `/internal-txs` | Internal calls, participants, values and pagination. |
| Token transfers | `/token-transfers` | Token identity, participants, indexed movements and cursors. |
| Accounts | `/accounts` | Rank, address/name, balance, transactions and supply share; the upstream total supply is ETH, not wei. Unequal page sizes preserve rank offsets. |
| Address and contract | `/address/:address` | Compact activity-first layout, full identity, assets/NFTs, history, logs, operations, source and read/write interactions. Deployment/proxy information appears only when available. |
| Token permissions | `/approvals`, address Approvals section | ERC-20 allowances, individual ERC-721 approvals and ERC-721/ERC-1155 operators; canonical state reads, wallet-owned simulation, explicit confirmation and receipt/state refresh. |
| Address history | Address History section | Paged exact historical balances/deltas; daily chart when the index supplies data. |
| Tokens | `/tokens`, `/token/:address` | Standards, supply, holders, transfers, instance owners (including token ID zero) and contract source/read/write sections. |
| NFT instances | `/token/:address/instance/:id` | Media, owner, creator, metadata, attributes and independent paged transfer history. Transfer totals use the count API, not the number of loaded rows. |
| Verified contracts | `/contracts`, `/verified-contracts` | Search, compiler/language information, pagination and native source destinations. |
| Pools | `/pools`, `/pools/:address` | Pair, liquidity, volume, fee tier, price/history and contract activity. |
| Deposits | `/deposits` | L1 origin and L2 inclusion, participants, amounts and cursors. L1 identifiers are not linked as Ink records. |
| Withdrawals | `/withdrawals` | L2 transaction, L1 settlement, challenge timing, amounts and cursors; upstream failures remain actionable. |
| Batches | `/batches`, `/batches/:number` | Count, storage container, L1 hashes/timestamps, EIP-4844 blob hashes, L2 boundaries and related blocks/transactions. |
| Dispute games | `/dispute-games` | Count, status/type, times and L1 contract identity; no misleading Ink-address link. |
| User operations | `/ops`, `/op/:hash` | ERC-4337 inclusion, sender, fees/gas, bundler, paymaster/factory and raw/decoded payload. Transfers/logs are restricted to the operation’s log index range. |
| Names | `/name-services`, `/name-services/domains/:name` | Protocol/search filters, address resolution/ownership, registration/expiry and events. Domain details use `protocol_id`, distinct from lookup `protocols`. |
| Statistics | `/stats`, `/stats/:metric`, `/analytics` | Complete live chart catalogue, category/search filters, counters, dates/ranges, chart inspection, exact data tables and CSV. Rate fractions are displayed as percentages while tables/CSV retain source values. The existing analytical overview remains available. |
| Gas | `/gas-tracker` | Exact wei-to-Gwei estimates, priorities, expected inclusion time, update time and historical chart. Execution and L1 data fees remain distinct. |
| Dapps | `/apps`, `/apps/:id` | Selected chain’s catalogue, text/category filters, native details, author/rating data and safe HTTPS application actions. |
| Verification | `/contract-verification` | Enabled Solidity/Vyper single-file, compiler JSON, multipart and Sourcify methods; original Hardhat/Foundry build-info import. Compiler settings/libraries and publication consent remain explicit. |
| Public labels | `/public-tags/submit` | Contacts, multiple addresses/labels, public metadata and private moderation queue. A receipt means pending review, not publication. |
| Search | `/search` | Native results and direct entity navigation. The reference’s search uses an inline widget; its `/search` route returned 404 during inspection. |

Each family is reachable from **Advanced → Explorer tools**, also accessible in
the footer. Detail links preserve the selected network. Tab choices persist in
the URL and support direct reloads.

## Intentional presentation choices

Account activity and balances take priority over empty contract fields and
third-party score/airdrop widgets. Secondary facts remain in Overview. Source
files, ABI, compiler settings and bytecode can be inspected without leaving the
page. ETH detail amounts preserve every wei instead of converting through a
floating-point number. Loading/error states and retry are part of the page,
including when one section fails while the entity profile remains available.

The comparison covers the chain explorer’s public pages and their functional
states. Blockscout’s separate identity, Merits, multichain and notification
services are not presented as services of this application. Opening the reference
watchlist route without a Blockscout session redirected to Home; no private
account records were accessed. WalletConnect QR connections are implemented and require the operator’s public Reown project ID/domain configuration. A dedicated approvals tool covers indexed standard ERC-20/ERC-721/ERC-1155 events, with live state verification and wallet-confirmed revocation. Non-standard or unindexed permissions and Permit2 are outside its scope. Account watchlists and email notifications remain absent. Configuration and actual relay pairing must be verified before claiming a working WalletConnect deployment. This comparison does not claim identical auxiliary services
or a mathematical absence of bugs.

## Evidence and release status

The initial native-page preflight passed 432 states: 24 states × two networks ×
three sizes/locales × Chromium, Firefox and WebKit. It found no runtime errors,
page overflow, official-explorer destinations or serious/critical Axe violations.
Later checks extend the compiler-import, data-export and submission scenarios.
Backend service tests use temporary stores and mock HTTP/Phoenix services; no
real contract sources or label proposals were published during testing.

Regression checks cover the NFT collection allowlist, token ID zero and owner
identity; the detailed gas-oracle header and its separate cache; legacy and
detailed gas rendering; name-service protocol IDs; exact wei; cursor recovery;
independent NFT history failures; and compiler build-info imports.

The live comparison additionally captures actual API-backed pages at desktop
and mobile sizes. One initial withdrawal request hit upstream HTTP 429; a later
read returned its records. That failed attempt remains recorded and is not
counted as successful data. Independent node/index reconciliation remains a
separate acceptance gate.

The previous 34-suite readability report certifies only its earlier snapshot.
On 3 October 2026, the expanded campaign passed 35 of its 36 gates on unchanged
source with matching served build assets. The remaining loading gate exposed a
test interception bug: query-bearing stats requests were not matched. After
correcting only that test harness, the same unchanged application passed the
loading rerun. The original NOT CERTIFIED report is preserved; combined evidence
validates all 36 checks without claiming the original command passed. All 24
Lighthouse reports passed, with performance 92–100 and accessibility, best
practices and SEO 100. Publication and deployed-site checks are tracked separately.

Chart requests are deferred until their panels approach the viewport. Closed
data tables do not construct hidden rows; opening them still exposes exact
source values. Loading states reserve space before data and the lazy page module
arrive, including gas cards, to prevent visible content jumps.

The earlier release evidence above applies only to its recorded snapshot. The wallet, approvals, translation and public-gateway additions require a fresh complete campaign and deployed-site verification. Dedicated tests use an isolated Anvil EVM and three browser engines; no public-network transactions are submitted. Public access evidence must identify the Internet destination, not rely on a connected tailnet.

The 4 October wallet/public-API validation executed all 38 suites without coverage filters. All 37 functional suites passed on unchanged source with matching served build assets. The original report remains NOT CERTIFIED because the mobile Blocks Lighthouse measurement scored 89. A complete recheck of all 24 Lighthouse reports on that same source passed every threshold (performance at least 92; accessibility, best practices and SEO 100); Blocks scored 93. Both measurements are retained in the combined validation evidence. This establishes the recorded functional and audit checks, not a claim that every individual performance sample passes. Actual WalletConnect relay pairing still requires the operator's public project ID.
