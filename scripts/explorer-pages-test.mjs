import assert from "node:assert/strict";
import { chromium, firefox, webkit } from "playwright";
import axe from "axe-core";
import { mkdir, writeFile } from "node:fs/promises";
import catalogue from "../src/ink-ecosystem.json" with { type: "json" };

const logoUrls = new Set(catalogue.map(app => app.imageUrl));
const blockscout = catalogue.find(app => app.id === "blockscout").links;

// These fixtures check navigation, precision and error recovery. They cannot
// certify index/node agreement, which has its own live reconciliation suite.
const base = process.env.BASE_URL || "http://127.0.0.1:4188";
const output = process.env.EXPLORER_PAGES_DIR || "reports/explorer-pages";
const addr = `0x${"1".repeat(40)}`,
  other = `0x${"2".repeat(40)}`,
  hash = `0x${"a".repeat(64)}`,
  blob = `0x${"b".repeat(64)}`;
const token = {
  address_hash: addr,
  name: "Fixture token",
  symbol: "FIX",
  type: "ERC-20",
  decimals: "18",
  holders_count: "12",
  total_supply: "100000000000000000000",
  exchange_rate: "1",
};
const transaction = {
  hash,
  status: "ok",
  from: { hash: addr },
  to: { hash: other },
  value: "1000000000000000000",
  block_number: 123,
  timestamp: "2026-10-01T12:00:00Z",
  fee: { value: "1000000000000" },
  gas_used: "21000",
  gas_price: "1000000",
  raw_input: "0x",
};
const results = [];
await mkdir(output, { recursive: true });
for (const [engine, type] of [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
].filter(([name])=>!process.env.EXPLORER_ENGINES||process.env.EXPLORER_ENGINES.split(',').includes(name))) {
  const browser = await type.launch(
    engine === "chromium"
      ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
      : {},
  );
  try {
    for (const prefix of ["", "/testnet"])
      for (const [width, lang] of [
        [320, "ar"],
        [390, "fr"],
        [1440, "en"],
      ]) {
        const context = await browser.newContext({
            viewport: { width, height: 900 },
          }),
          page = await context.newPage(),
          errors = [];
        // The catalogue's real artwork has its own live browser check.
        await context.route(url => logoUrls.has(url.href), route => route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"/>',
        }));
        let failCursor = false,
          failHistory = false,
          legacyGas = false,
          expandedCharts = false,
          postCount = 0;
        const chartRequests = new Set();
        page.on("pageerror", (e) => errors.push(e.message));
        // Native-page fixtures use a valid scoped live welcome. Live transport
        // failures are exercised by the independent lifecycle suite. Closing a
        // socket and returning malformed snapshots here introduced unrelated
        // polling while WebKit was replacing the document (Playwright #43120).
        const liveFrame = () => ({
          protocol: "ink-observer.live.v1", type: "welcome", sequence: 1,
          sentAt: new Date().toISOString(),
          network: { chainId: prefix ? 763373 : 57073, expectedChainId: prefix ? 763373 : 57073,
            online: true, synced: true, stale: false, head: 123 },
          blocks: [], transactions: [],
        });
        await context.routeWebSocket(/\/api\/live$/, socket => socket.send(JSON.stringify(liveFrame())));
        await context.route("**/api/**", async (route) => {
          const request = route.request(),
            url = new URL(request.url()),
            p = url.pathname.replace(/^\/testnet/, "").slice(4);
          const fulfill = (data) => route.fulfill({headers:{date:new Date().toUTCString(),'x-ink-data-status':'fresh','x-ink-data-fetched-at':new Date().toISOString()},json:data});
          if (p === "/live/config") return fulfill({ url: `${base.replace(/^http/, "ws")}${prefix}/api/live` });
          if (p === "/live/snapshot") return fulfill(liveFrame());
          if (request.method() === "POST") {
            postCount++;
            assert(
              !/explorer(?:-sepolia)?\.inkonchain\.com/.test(url.hostname),
              "Publishing requests must use our own service",
            );
            const body = request.postDataJSON();
            assert.equal(body.consent, true);
            return fulfill(
              p === "/verification/submit"
                ? {
                    ticket: "fixture-ticket",
                    address: addr,
                    status: "verified",
                    message: "Fixture verification result",
                  }
                : { id: "fixture-tag", status: "pending" },
            );
          }
          if (p === "/public-tags/types")
            return fulfill({ items: ["name", "generic"] });
          if (p === "/explorer/smart-contracts/verification/config")
            return fulfill({
              solidity_compiler_versions: ["v0.8.36+commit.8a079791"],
              vyper_compiler_versions: ["v0.3.10"],
              license_types: { none: 1, mit: 3 },
              verification_options: [
                "standard-input",
                "flattened-code",
                "multi-part",
                "sourcify",
                "vyper-code",
                "vyper-multi-part",
                "vyper-standard-input",
              ],
              solidity_evm_versions: ["default", "cancun"],
              vyper_evm_versions: ["default"],
            });
          if (p === "/explorer/addresses") {
            if (failCursor && url.searchParams.has("cursor"))
              return route.fulfill({
                status: 503,
                json: { error: "Fixture cursor unavailable" },
              });
            const second = url.searchParams.has("cursor");
            return fulfill({
              total_supply: "100.5",
              items: Array.from({ length: second ? 1 : 2 }, (_, i) => ({
                hash: i === 0 ? addr : other,
                coin_balance: "1005000000000000000",
                transactions_count: "123",
                is_contract: i === 0,
              })),
              next_page_params: second ? null : { cursor: "second" },
            });
          }
          if (p === "/explorer/stats")
            return fulfill({
              gas_prices: legacyGas
                ? { slow: 0.01, average: 0.02, fast: 0.03 }
                : {
                    slow: { wei: "1000001", time: 1234, priority_fee_wei: "0" },
                    average: {
                      wei: "2000001",
                      time: 1000,
                      priority_fee_wei: "100",
                    },
                    fast: {
                      wei: "3000001",
                      time: 900,
                      priority_fee_wei: "200",
                    },
                  },
              gas_price_updated_at:new Date().toISOString(),
            });
          if (p === "/stats/lines")
            return fulfill({
              sections: [
                {
                  id: "accounts",
                  title: "Accounts",
                  charts: [
                    {
                      id: "accountsGrowth",
                      title: "Number of accounts",
                      description: "Account count", resolutions:["DAY","WEEK"],
                      units: null,
                    },
                  ],
                },
                {
                  id: "gas",
                  title: "Gas",
                  charts: [
                    {
                      id: "averageGasPrice",
                      title: "Average gas price",
                      description: "Gwei history", resolutions:["DAY","WEEK"],
                      units: "Gwei",
                    },
                    ...(expandedCharts
                      ? [
                          {
                            id: "txnsSuccessRate",
                            title: "Transaction success rate",
                            description: "Below the fold", resolutions:["DAY","WEEK"],
                            units: null,
                          },
                        ]
                      : []),
                  ],
                },
              ],
            });
          if (p.startsWith("/stats/lines/")) {
            chartRequests.add(p.split("/").at(-1));
            const day=86400000,today=Date.parse(new Date().toISOString().slice(0,10)),weekly=url.searchParams.get('resolution')==='WEEK';
            const start=weekly?today-((new Date(today).getUTCDay()+6)%7)*day-7*day:today-day;
            const stamp=ms=>new Date(ms).toISOString().slice(0,10);
            return fulfill({chart:[0,1].map(i=>({date:stamp(start+i*(weekly?7:1)*day),date_to:stamp(start+(i*(weekly?7:1)+(weekly?6:0))*day),value:p.endsWith('/txnsSuccessRate')?(i?'0.975':'0.9'):String(i+1)}))});
          }
          if (p === "/stats/counters")
            return fulfill({
              counters: [
                {
                  id: "totalAccounts",
                  title: "Total accounts",
                  value: "9007199254740993",
                },
              ],
            });
          if (p === "/names/protocols")
            return fulfill({
              items: [
                { id: "ens", title: "ENS" },
                { id: "zns-ink", title: "Ink names" },
              ],
            });
          if (p === "/names/domains:lookup" || p === "/names/addresses:lookup")
            return fulfill({
              items: [
                {
                  name: "fixture.ink",
                  protocol: { id: "zns-ink", short_name: "ZNS" },
                  resolved_address: { hash: addr },
                  registration_date: "2026-01-01",
                  expiry_date: "2027-01-01",
                },
              ],
            });
          if (
            p.startsWith("/names/domains/") &&
            !url.searchParams.has("protocol_id")
          )
            return route.fulfill({
              status: 404,
              json: { error: "Domain protocol namespace is required" },
            });
          if (p.startsWith("/names/domains/"))
            return fulfill(
              p.endsWith("/events")
                ? { items: [{ action: "registered", timestamp: "2026-01-01" }] }
                : {
                    name: "fixture.ink",
                    owner: { hash: other },
                    resolved_address: { hash: addr },
                    protocol: { title: "Ink names" },
                  },
            );
          if (p === "/dapps")
            return fulfill([
              {
                id: "fixture-app",
                title: "Fixture app",
                shortDescription: "Sample app",
                description: "Full app description",
                categories: ["DeFi"],
                url: "https://example.invalid",
                rating: 4,
                ratingsTotalCount: 12,
              },
              {
                id: "blocked-app",
                title: "Blocked link fixture",
                categories: [],
                url: "https://explorer.inkonchain.com/",
              },
            ]);
          if (p.endsWith("/count") && p.includes("/optimism/"))
            return fulfill(123);
          if (p.startsWith("/explorer/optimism/batches"))
            return fulfill(
              p.endsWith("/123")
                ? {
                    number: 123,
                    transactions_count: 1,
                    l1_timestamp: "2026-10-01",
                    l1_transaction_hashes: [hash],
                    l2_start_block_number: 123,
                    l2_end_block_number: 123,
                    batch_data_container: "in_blob4844",
                    blobs: [
                      {
                        hash: blob,
                        l1_transaction_hash: hash,
                        l1_timestamp: "2026-10-01",
                      },
                    ],
                  }
                : {
                    items: [
                      {
                        number: 123,
                        transactions_count: 1,
                        l1_timestamp: "2026-10-01",
                        l1_transaction_hashes: [hash],
                        l2_start_block_number: 123,
                        l2_end_block_number: 123,
                        batch_data_container: "in_blob4844",
                      },
                    ],
                  },
            );
          if (p === "/explorer/optimism/games")
            return fulfill({
              items: [
                {
                  index: 123,
                  contract_address_hash: other,
                  game_type: 0,
                  status: "In progress",
                  created_at: "2026-10-01",
                  l2_timestamp: "2026-10-01",
                },
              ],
            });
          if (p.startsWith("/explorer/proxy/account-abstraction/operations"))
            return fulfill(
              p.endsWith(hash)
                ? {
                    hash,
                    sender: addr,
                    transaction_hash: hash,
                    block_number: 123,
                    status: true,
                    fee: "0",
                    gas_used: "9007199254740993",
                    user_logs_start_index: 7,
                    user_logs_count: 1,
                    raw: { sender: addr, callData: "0xabcdef" },
                  }
                : {
                    items: [
                      {
                        hash,
                        address: { hash: addr },
                        transaction_hash: hash,
                        status: true,
                        fee: "0",
                        block_number: 123,
                      },
                    ],
                  },
            );
          if (p.startsWith("/explorer/addresses/")) {
            if (p.endsWith("/counters"))
              return fulfill({
                transactions_count: 1,
                token_transfers_count: 1,
              });
            if (p.endsWith("/coin-balance-history-by-day"))
              return fulfill({ items: [] });
            if (p.endsWith("/coin-balance-history"))
              return fulfill({
                items: [
                  {
                    transaction_hash: hash,
                    block_number: 123,
                    block_timestamp: "2026-10-01",
                    value: "1000000000000000001",
                    delta: "-1",
                  },
                ],
              });
            if (p.endsWith("/token-balances")) return fulfill([]);
            if (p.endsWith("/transactions"))
              return fulfill({ items: [transaction] });
            if (p.split("/").length > 4) return fulfill({ items: [] });
            return fulfill({
              hash: addr,
              is_contract: true,
              is_verified: true,
              coin_balance: "1",
              name: "Fixture contract",
              balance_check: { status: "matched", source: "local" },
            });
          }
          if (p.startsWith("/explorer/smart-contracts/"))
            return fulfill({
              name: "Fixture contract",
              is_verified: true,
              source_code: "contract Fixture {}",
              compiler_version: "v0.8.36",
              abi: [],
            });
          if (p.includes("/instances/")) {
            if (p.endsWith("/transfers-count"))
              return fulfill({ transfers_count: 0 });
            if (p.endsWith("/transfers"))
              return failHistory
                ? route.fulfill({
                    status: 503,headers:{"retry-after":"1"},
                    json: { error: "Fixture history unavailable" },
                  })
                : fulfill({ items: [] });
            return fulfill({
              id: "7",
              metadata: {
                name: "Fixture NFT",
                description: "NFT remains readable during a history error",
              },
              owner: { hash: other },
              external_app_url: "https://explorer.inkonchain.com/",
            });
          }
          if (p.startsWith("/explorer/tokens/"))
            return fulfill(p.split("/").length === 4 ? token : { items: [] });
          if (p.startsWith("/explorer/transactions/")) {
            if (p.endsWith("/raw-trace"))
              return fulfill({
                type: "CALL",
                from: addr,
                to: other,
                gasUsed: "0x5208",
                calls: [],
              });
            if (p.endsWith("/logs"))
              return fulfill({
                items: [
                  { index: 6, data: "outside-op" },
                  { index: 7, data: "inside-op" },
                  { index: 8, data: "outside-op" },
                ],
              });
            if (p.endsWith("/token-transfers"))
              return fulfill({
                items: [
                  {
                    transaction_hash: hash,
                    log_index: 6,
                    from: { hash: addr },
                    to: { hash: other },
                    token,
                    total: { value: "1" },
                  },
                  {
                    transaction_hash: hash,
                    log_index: 7,
                    from: { hash: addr },
                    to: { hash: other },
                    token,
                    total: { value: "2" },
                  },
                ],
              });
            if (p.endsWith("/internal-transactions"))
              return fulfill({
                items: [
                  {
                    transaction_hash: hash,
                    from: { hash: addr },
                    to: { hash: other },
                    value: "1000000000000000000",
                    type: "call",
                    success: false,
                    error: "execution reverted",
                  },
                ],
              });
            if (p.split("/").length === 4) return fulfill(transaction);
            return fulfill({ items: [] });
          }
          if (p.includes("/optimism-batch/"))
            return fulfill({
              items: p.includes("/blocks/")
                ? [
                    {
                      height: 123,
                      hash,
                      timestamp: "2026-10-01",
                      transactions_count: 1,
                      gas_used: "21000",
                      gas_limit: "1000000",
                    },
                  ]
                : [transaction],
            });
          if (p.startsWith("/contract-info/")) return fulfill(null);
          return fulfill({ items: [] });
        });
        const visit = async (path) => {
          console.log(`Visiting ${engine} ${prefix||'mainnet'} ${width}px ${path}`);
          await page.goto(
            `${base}${prefix}${path}${path.includes("?") ? "&" : "?"}lang=${lang}`,
            { waitUntil: "domcontentloaded" },
          );
          // The initial document also has a heading before React mounts.
          await page.locator("#ink-startup").waitFor({ state: "detached" });
          await page.locator("#main-content h1").waitFor();
          await page.waitForFunction(
            () => !document.querySelector("#main-content .loading"),
          );
        };
        const check = async (path) => {
          const layout = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - innerWidth,
            links: [...document.querySelectorAll("a[href]")]
              .filter(
                (a) =>
                  /^https?:/.test(a.href) &&
                  /explorer(?:-sepolia)?\.inkonchain\.com/.test(
                    new URL(a.href).hostname,
                  ),
              )
              .map((a) => a.href),
            text: document.querySelector("main").innerText,
          }));
          assert(layout.overflow <= 1, `${path} overflow ${layout.overflow}`);
          const officialLinks = path === "/apps"
            ? [new URL(prefix ? blockscout.testnetWebsite : blockscout.mainnetWebsite).href]
            : [];
          assert.deepEqual(layout.links, officialLinks, `${path} upstream explorer links`);
          assert(!layout.text.includes("Page not found"));
          await page.evaluate(axe.source);
          const violations = await page.evaluate(async () =>
            (
              await window.axe.run(document, { resultTypes: ["violations"] })
            ).violations
              .filter((v) => ["serious", "critical"].includes(v.impact))
              .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          );
          assert.deepEqual(violations, [], `${path} accessibility`);
          assert.deepEqual(errors, []);
          results.push({
            engine,
            prefix,
            width,
            lang,
            path,
            overflow: layout.overflow,
          });
        };
        const paths = [
          "/accounts",
          "/batches",
          "/batches/123",
          "/batches/123?tab=blocks",
          "/dispute-games",
          "/gas-tracker",
          "/name-services",
          "/name-services/domains/fixture.ink?protocols=zns-ink",
          "/apps",
          "/apps/fixture-app",
          "/stats",
          "/stats/accountsGrowth",
          "/contract-verification",
          "/public-tags/submit",
          `/op/${hash}`,
          `/op/${hash}?tab=transfers`,
          `/op/${hash}?tab=logs`,
          `/op/${hash}?tab=raw`,
          `/address/${addr}?tab=history`,
          `/address/${addr}?tab=userops`,
          `/tx/${hash}?tab=flows`,
          `/tx/${hash}?tab=trace`,
          `/token/${addr}?tab=contract`,
          `/token/${addr}/instance/7`,
        ];
        for (const path of paths) {
          await visit(path);
          await check(path);
        }
        if (lang === "en") {
          await visit("/accounts");
          const accountRows=page.locator('.ledger-record'),accountPager=page.locator('.token-list-controls .cursor-pagination');
          await accountRows.first().waitFor();
          assert.equal(await accountRows.first().locator('.ledger-cell-percentage').innerText(),'N/A','Ethereum supply cannot provide an Ink balance percentage');
          assert.equal(await accountRows.first().locator('.ledger-amount strong').getAttribute('title'),'1.005');
          await accountPager.getByRole('button',{name:'Next page',exact:true}).click();
          await page.locator('.ledger-rank').filter({hasText:'#3'}).waitFor();
          await accountPager.getByRole('button',{name:'Previous page',exact:true}).click();
          await page.locator('.ledger-rank').filter({hasText:'#1'}).waitFor();
          failCursor=true;await accountPager.getByRole('button',{name:'Next page',exact:true}).click();await page.locator('.error-state').waitFor();
          assert(await accountPager.getByRole('button',{name:'Previous page',exact:true}).isEnabled());
          await accountPager.getByRole('button',{name:'Previous page',exact:true}).click();await page.locator('.ledger-rank').filter({hasText:'#1'}).waitFor();failCursor=false;
          await visit("/gas-tracker");
          assert.match(await page.locator("main").innerText(), /0\.001000001/);
          assert.match(await page.locator("main").innerText(), /1\.234 s/);
          legacyGas = true;
          await visit("/gas-tracker");
          assert.match(
            await page
              .locator(".gas-estimates article strong")
              .first()
              .innerText(),
            /0\.01\s*Gwei/,
          );
          legacyGas = false;
          await visit(`/op/${hash}?tab=transfers`);
          assert.equal(await page.locator(".explorer-record").count(), 1);
          await page.reload();
          await page.waitForFunction(() =>
            document.querySelector(".explorer-record"),
          );
          assert.equal(
            await page.locator(".explorer-select select").inputValue(),
            "transfers",
          );
          await visit(`/op/${hash}?tab=logs`);
          assert.equal(await page.locator(".explorer-record").count(), 1);
          await page.locator(".event-raw summary").click();
          assert.match(
            await page.locator(".explorer-record").innerText(),
            /inside-op/,
          );
          assert.doesNotMatch(
            await page.locator(".explorer-record").innerText(),
            /outside-op/,
          );
          await visit(`/tx/${hash}?tab=trace`);
          // Transaction identity and its related trace resolve independently.
          // Wait for the trace itself instead of sampling an effect transition.
          await page.locator(".code-panel pre").waitFor();
          assert.match(await page.locator("main").innerText(), /CALL/);
          await visit(`/tx/${hash}?tab=flows`);
          assert.match(
            await page.locator("main").innerText(),
            /Reverted — no balance movement/,
          );
          failHistory = true;
          await visit(`/token/${addr}/instance/7?tab=transfers`);
          await page.locator(".nft-activity .error-state").waitFor();
          assert.match(await page.locator("h1").innerText(), /Fixture NFT/);
          failHistory = false;await page.waitForTimeout(1100);
          await page.locator(".nft-activity .error-state button").click();
          await page.locator(".nft-activity .empty").waitFor();
          await visit("/contract-verification");
          await page.locator(".explorer-form input").first().fill(addr);
          assert.equal(await page.locator(".explorer-form textarea").first().evaluate(input => input.labels?.[0]?.textContent.trim()), "Standard input JSON");
          assert.equal(await page.locator('.explorer-form input[type="file"]').first().evaluate(input => input.labels?.[0]?.textContent.trim()), "Source files");
          await page
            .locator(".explorer-form textarea")
            .first()
            .fill(
              JSON.stringify({
                language: "Solidity",
                sources: { "Fixture.sol": { content: "contract Fixture {}" } },
              }),
            );
          await page.locator(".explorer-form button[type=submit]").click();
          assert.equal(postCount, 0, "Consent is required before submission");
          await page
            .locator(".explorer-form input[type=checkbox]")
            .last()
            .check();
          await page.locator(".explorer-form button[type=submit]").click();
          await page.locator(".explorer-feedback[role=status]").waitFor();
          assert.equal(postCount, 1);
          assert.match(
            await page.locator(".explorer-feedback").innerText(),
            /Source verified/,
          );
          await visit("/stats/accountsGrowth");
          await page.locator(".chart-data summary").click();
          await page.locator(".chart-data table").waitFor();
          assert.match(
            await page.locator(".chart-data tbody").innerText(),
            /2026/,
          );
          await Promise.all([
            page.waitForResponse(
              (r) =>
                new URL(r.url()).pathname.endsWith("/lines/accountsGrowth") &&
                !new URL(r.url()).searchParams.has("from"),
            ),
            page.locator(".chart-range select").selectOption("0"),
          ]);
          expandedCharts = true;
          await page.setViewportSize({ width: 390, height: 900 });
          await visit("/stats");
          await page.locator('.stats-category-select select').selectOption('');
          assert(
            !chartRequests.has("txnsSuccessRate"),
            "Off-screen charts should not fetch data before approaching the viewport",
          );
          const deferredChart = page
            .locator(".stats-chart-card")
            .filter({ hasText: "Transaction success rate" });
          await Promise.all([
            page.waitForResponse((response) =>
              new URL(response.url()).pathname.endsWith(
                "/lines/txnsSuccessRate",
              ),
            ),
            deferredChart.scrollIntoViewIfNeeded(),
          ]);
          assert.equal(
            await deferredChart.locator(".chart-data table").count(),
            0,
            "Closed data tables should not create hidden rows",
          );
          await deferredChart.locator(".chart-data summary").click();
          await deferredChart.locator(".chart-data tbody tr").first().waitFor();
          assert.equal(
            await deferredChart.locator(".chart-data tbody tr").count(),
            2,
          );
          assert.match(
            await deferredChart.locator(".stat-chart-value").innerText(),
            /97\.5\s*%/,
          );
          assert.match(
            await deferredChart.locator(".chart-data tbody").innerText(),
            /0\.975/,
          );
          expandedCharts = false;
          await page.setViewportSize({ width, height: 900 });
          await visit("/contract-verification");
          const form = page.locator(".explorer-form");
          await form.locator("input").first().fill(addr);
          await form.locator("select").first().selectOption("solidity-hardhat");
          const originalInput = {
            language: "Solidity",
            sources: {
              "contracts/Fixture.sol": { content: "contract Fixture {}" },
            },
            settings: { optimizer: { enabled: true, runs: 999 }, viaIR: true },
          };
          await form.locator("input[type=file]").setInputFiles({
            name: "build-info.json",
            mimeType: "application/json",
            buffer: Buffer.from(
              JSON.stringify({
                solcLongVersion: "0.8.36+commit.8a079791",
                input: originalInput,
                output: { ignored: true },
              }),
            ),
          });
          await page.waitForFunction(() =>
            document
              .querySelector(".explorer-form textarea")
              ?.value.includes("contracts/Fixture.sol"),
          );
          assert.deepEqual(
            JSON.parse(await form.locator("textarea").first().inputValue()),
            originalInput,
            "Build information must preserve the original compiler settings",
          );
          await visit("/public-tags/submit");
          const tags = page.locator(".explorer-form");
          const addLabel = tags.getByRole("button", { name: "Add label", exact: true });
          const extra = tags.locator("fieldset[data-extra-label]");
          await addLabel.press("Enter");
          assert.equal(await extra.first().locator("input").first().evaluate(input => input === document.activeElement), true);
          await extra.first().getByRole("button", { name: "Remove label", exact: true }).press("Enter");
          assert.equal(await addLabel.evaluate(button => button === document.activeElement), true);
          await tags
            .locator("input[type=email]")
            .fill("fixture@example.invalid");
          await tags.locator("input").nth(0).fill("Fixture Owner");
          await tags.locator("input").nth(4).fill(addr);
          await tags.locator("input").nth(5).fill("Fixture label");
          await tags
            .locator("textarea")
            .fill(
              "Fixture proposal; this POST is intercepted and cannot publish.",
            );
          await tags.locator("input[type=checkbox]").check();
          await tags.locator("button[type=submit]").click();
          await page.locator(".explorer-feedback[role=status]").waitFor();
          assert.match(
            await page.locator(".explorer-feedback").innerText(),
            /awaiting review/,
          );
          assert.equal(postCount, 2);
        }
        console.log(
          `${engine} ${prefix || "/"} ${width}px ${lang}: ${paths.length} native page states passed`,
        );
        await context.close();
      }
  } finally {
    await browser.close();
  }
}
await writeFile(
  `${output}/results.json`,
  JSON.stringify(
    { recordedAt: new Date().toISOString(), fixtureOnly: true, results },
    null,
    2,
  ),
);
console.log(
  `Native explorer: ${results.length} states, both networks, ${process.env.EXPLORER_ENGINES||'chromium,firefox,webkit'}, official explorer destinations checked by route and network.`,
);
