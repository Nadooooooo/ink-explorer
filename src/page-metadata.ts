// One metadata source for the initial HTTP document and every browser navigation.
import { canonicalExplorerPath, parseExplorerPath } from "./page-seo.ts";
import { homeGuideCopy, homePageTitles } from "./home-guide-copy.ts";
import { ecosystemAppIdentity } from "./ink-ecosystem-route.ts";
import { seoDescriptions } from "./seo-descriptions.ts";

const ecosystemAppDescription = "Explore {app} in the Ink ecosystem and find its website, links and supported networks.";

const missingPages = {
  en: ["Page not found", "The requested Ink explorer page could not be found.", "Return to the chain"],
  zh: ["页面未找到", "找不到所请求的 Ink 区块链浏览器页面。", "返回链上浏览"],
  hi: ["पेज नहीं मिला", "Ink एक्सप्लोरर का अनुरोधित पेज नहीं मिला।", "चेन पर लौटें"],
  es: ["Página no encontrada", "No se ha encontrado la página solicitada de Ink Explorer.", "Volver a la cadena"],
  fr: ["Page introuvable", "La page demandée dans Ink Explorer est introuvable.", "Revenir à la chaîne"],
  ar: ["الصفحة غير موجودة", "تعذّر العثور على الصفحة المطلوبة في مستكشف Ink.", "العودة إلى السلسلة"],
  bn: ["পৃষ্ঠা পাওয়া যায়নি", "Ink এক্সপ্লোরারের অনুরোধ করা পৃষ্ঠাটি পাওয়া যায়নি।", "চেইনে ফিরুন"],
  pt: ["Página não encontrada", "Não foi possível encontrar a página solicitada do Ink Explorer.", "Voltar à rede"],
  ru: ["Страница не найдена", "Запрошенная страница обозревателя Ink не найдена.", "Вернуться к сети"],
  ja: ["ページが見つかりません", "Ink Explorer のリクエストされたページが見つかりません。", "チェーンに戻る"],
} as const;

export function notFoundPageCopy(locale: string): readonly [string, string, string] {
  return Object.hasOwn(missingPages, locale) ? missingPages[locale as keyof typeof missingPages] : missingPages.en;
}

export function defaultPageMetadata(pathname: string, basePath = ""): [string, string] {
  pathname = canonicalExplorerPath(pathname);
  if (!parseExplorerPath(pathname, basePath)) return ["Page not found — Ink Explorer", "The requested Ink explorer page could not be found."];
  if (/^\/approvals\/0x[\da-f]{40}$/i.test(pathname)) return ["Ink token approvals — Ink Explorer", "Inspect and revoke ERC-20 and NFT approvals on Ink."];
  const explorerTitles: Record<string, string> = {
    "/approvals": "Ink token approvals",
    "/accounts": "Top Ink accounts", "/internal-txs": "Ink internal transactions",
    "/token-transfers": "Ink token transfers", "/deposits": "Ethereum to Ink deposits",
    "/withdrawals": "Ink to Ethereum withdrawals", "/batches": "Ink transaction batches",
    "/dispute-games": "Ink dispute games", "/ops": "Ink user operations",
    "/name-services": "Name services lookup", "/gas-tracker": "Ink gas tracker",
    "/apps": "Ink ecosystem applications", "/contract-verification": "Verify Ink contract source",
    "/public-tags/submit": "Submit an Ink public tag", "/verified-contracts": "Verified Ink contracts",
    "/stats": "Ink chain statistics",
  };
  if (explorerTitles[pathname]) return [`${explorerTitles[pathname]} — Ink Explorer`, seoDescriptions[pathname] || "Browse Ink Mainnet chain data and tools inside Ink Explorer."];
  if (/^\/batches\/\d+$/.test(pathname)) return [`Ink transaction batch ${pathname.slice(9)} — Ink Explorer`, "L1 publication, L2 blocks and transactions in an Ink batch."];
  if (/^\/op\/0x[\da-f]{64}$/i.test(pathname)) return ["Ink user operation — Ink Explorer", "ERC-4337 sender, gas, fees, inclusion and decoded operation data."];
  if (/^\/name-services\/domains\/[a-zA-Z0-9_.%~-]{1,750}$/.test(pathname)) return ["Domain details — Ink Explorer", "Domain registration, expiry, owner and resolved address."];
  if (/^\/apps\/[a-zA-Z0-9_.-]{1,160}$/.test(pathname)) {
    const id = pathname.slice(6);
    const app = ecosystemAppIdentity(id, basePath === "/testnet");
    if (app) {
      return [`${app.name} · Ink ecosystem — Ink Explorer`, ecosystemAppDescription.replace("{app}", app.name)];
    }
    return [`Ink Dapp ${id} — Ink Explorer`, `Description, categories and website for Ink Mainnet application ${id}.`];
  }
  if (/^\/stats\/[a-zA-Z0-9_-]{1,120}$/.test(pathname)) {
    const id = pathname.slice(7);
    return [`Ink statistic ${id} — Ink Explorer`, `Historical chart values, time ranges and CSV export for Ink Mainnet statistic ${id}.`];
  }
  const routes: Record<string, [string, string]> = {
    "/": [
      homePageTitles.en,
      homeGuideCopy.en[1].replace("{network}", "Ink Mainnet"),
    ],
    "/search": [
      "Search Ink Mainnet — Ink Explorer",
      "Search addresses, verified contracts, tokens, blocks and transactions on Ink Mainnet.",
    ],
    "/blocks": [
      "Ink blocks — Ink Explorer",
      "Latest Ink Mainnet blocks with transaction counts, gas use, size and fees.",
    ],
    "/txs": [
      "Ink transactions — Ink Explorer",
      "Search confirmed Ink transactions, token transfers and internal contract calls.",
    ],
    "/tokens": [
      "Ink tokens and NFTs — Ink Explorer",
      "Fungible tokens, NFT collections, holders, supply and transfers on Ink Mainnet.",
    ],
    "/pools": [
      "Ink liquidity pools — Ink Explorer",
      "Live liquidity, trading volume, paired assets, DEXs and fee tiers across Ink Mainnet.",
    ],
    "/contracts": [
      "Verified Ink contracts — Ink Explorer",
      "Verified contract source code, compiler details, proxy implementations and deployment data on Ink.",
    ],
    "/analytics": [
      "Ink network analytics — Ink Explorer",
      seoDescriptions["/analytics"],
    ],
    "/advanced": [
      "Ink bridge and account abstraction activity — Ink Explorer",
      seoDescriptions["/advanced"],
    ],
    "/developers": [
      "Ink Explorer developer API",
      "Read-only Ink explorer endpoints, WebSocket events and local OP-Reth status.",
    ],
    "/network": [
      "Ink network health — Ink Explorer",
      seoDescriptions["/network"],
    ],
  };
  if (/^\/tx\/0x[\da-f]{64}$/i.test(pathname))
    return [
      `Ink transaction ${pathname.slice(4, 18)}… — Ink Explorer`,
      `Fees, transfers, logs, state changes and execution trace for transaction ${pathname.slice(4)} on Ink.`,
    ];
  if (/^\/block\/(\d+|0x[\da-f]{64})$/i.test(pathname))
    return [
      `Ink block ${pathname.slice(7)} — Ink Explorer`,
      `Transactions, gas, fees, size and hashes for Ink block ${pathname.slice(7)}.`,
    ];
  if (/^\/address\/0x[\da-f]{40}$/i.test(pathname))
    return [
      `Ink address ${pathname.slice(9, 23)}… — Ink Explorer`,
      `Balance, assets, NFTs, activity, contract source and deployment details for address ${pathname.slice(9)} on Ink.`,
    ];
  const nftInstance = pathname.match(/^\/token\/(0x[\da-f]{40})\/instance\/(0|[1-9]\d{0,77})$/i);
  if (nftInstance && BigInt(nftInstance[2]) < 2n ** 256n)
    return [
      `Ink NFT #${nftInstance[2]} · ${nftInstance[1].slice(0,10)}…${nftInstance[1].slice(-6)} — Ink Explorer`,
      `Owner, artwork, attributes and transfer history for NFT #${nftInstance[2]} from collection ${nftInstance[1]} on Ink Mainnet.`,
    ];
  if (/^\/token\/0x[\da-f]{40}$/i.test(pathname))
    return [
      `Ink token ${pathname.slice(7, 21)}… — Ink Explorer`,
      `Supply, holders, transfers and NFT instances for token ${pathname.slice(7)} on Ink.`,
    ];
  if (/^\/pools\/0x(?:[\da-f]{40}|[\da-f]{64})$/i.test(pathname))
    return [
      `Ink pool ${pathname.slice(7, 21)}… — Ink Explorer`,
      `Liquidity, volume, fee tier, paired assets, DEX and contract activity for pool ${pathname.slice(7)} on Ink.`,
    ];
  return (
    routes[pathname] || [
      "Page not found — Ink Explorer",
      "The requested Ink explorer page could not be found.",
    ]
  );
}

export function explorerPageMetadata(url: URL, { basePath = "", locale = "en", translate = key => key, format = (key, values) => translate(key).replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "") }: {
  basePath?: string; locale?: string; translate?: (key: string) => string; format?: (key: string, values: Record<string, string>) => string;
} = {}): [string, string] {
  const pathname = canonicalExplorerPath(url.pathname);
  if (pathname !== url.pathname) {
    url = new URL(url);
    url.pathname = pathname;
  }
  const defaults = defaultPageMetadata(url.pathname, basePath);
  const finish = ([title, description]: [string, string]): [string, string] => {
    const network = basePath ? "Ink Sepolia" : "Ink Mainnet";
    title = title.replaceAll("Ink Mainnet", network);
    if (basePath && !title.includes(network)) title += ` · ${network}`;
    return [title, description.replaceAll("Ink Mainnet", network)];
  };
  if (!parseExplorerPath(url.pathname, basePath)) {
    const [heading, description] = notFoundPageCopy(locale);
    return finish([`${heading} — Ink Explorer`, description]);
  }
  if (locale === "en") return finish(defaults);
  const network = basePath ? "Ink Sepolia" : "Ink Mainnet";
  const labels: Record<string, string> = { "/": "homeDescription", "/search": "search", "/blocks": "blocks", "/txs": "transactions", "/tokens": "tokens", "/pools": "pools", "/contracts": "contracts", "/verified-contracts": "contracts", "/analytics": "analytics", "/advanced": "advanced", "/developers": "Developer API", "/network": "network", "/accounts": "Top accounts", "/internal-txs": "Internal transactions", "/token-transfers": "Token transfers", "/deposits": "L1 → L2 deposits", "/withdrawals": "L2 → L1 withdrawals", "/batches": "Transaction batches", "/dispute-games": "Dispute games", "/ops": "User operations", "/name-services": "Name services", "/gas-tracker": "Gas tracker", "/apps": "Ink ecosystem", "/approvals": "approvalsTitle", "/contract-verification": "Verify contract", "/public-tags/submit": "Submit public tag", "/stats": "All statistics" };
  const descriptions: Record<string, string> = { "/": "homeDescription", "/blocks": "blocksIntro", "/txs": "txIntro", "/pools": "poolIntro", "/contracts": "contractDirectory", "/verified-contracts": "contractDirectory", "/developers": "Read-only explorer routes, live WebSocket events and local node status." };
  let label = labels[url.pathname];
  let identifier = "";
  if (!label) {
    const detail = url.pathname.match(/^\/(tx|block|address|token|pools|approvals|batches|op|apps|stats)\/(.+)$/);
    if (detail) {
      const keys: Record<string, string> = { tx: "transactions", block: "blocks", address: "address", token: "tokens", pools: "pool", approvals: "approvalsTitle", batches: "Transaction batches", op: "User operation", apps: "Dapps", stats: "All statistics" };
      label = keys[detail[1]];
      identifier = detail[2];
      if (detail[1] === "apps") {
        const app = ecosystemAppIdentity(identifier, basePath === "/testnet");
        if (app) return finish([
          `${app.name} · ${translate("Ink ecosystem")} — Ink Explorer`,
          format(ecosystemAppDescription, { app: app.name }),
        ]);
      }
      if (detail[1] === "token" && identifier.includes("/instance/")) {
        label = "nftInstance";
        const [collection,tokenId]=identifier.split("/instance/");
        identifier = `#${tokenId} · ${collection.slice(0,10)}…${collection.slice(-6)}`;
      }
      else if (identifier.length > 36) identifier = `${identifier.slice(0, 14)}…${identifier.slice(-10)}`;
    } else if (url.pathname.startsWith("/name-services/domains/")) label = "Name services";
  }
  if (!label) return finish(defaults);
  const title = url.pathname === "/" ? homePageTitles[locale as keyof typeof homePageTitles].replace("Ink Mainnet",network) : `${translate(label)}${identifier ? ` ${identifier}` : ""} — Ink Explorer`;
  const description = url.pathname === "/tokens" ? format("tokenDirectory", { network }) : translate(seoDescriptions[url.pathname] || descriptions[url.pathname] || "homeDescription").replaceAll("Ink Mainnet", network);
  return finish([title, description]);
}
