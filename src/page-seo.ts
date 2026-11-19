import { ecosystemAppIdentity, isEcosystemAppId } from "./ink-ecosystem-route.ts";
import type { Locale } from "./i18n";

export type ExplorerRoute = { name: string; id?: string; tokenId?: string; query?: string };

// These routes mount the shared tools module on their first render. Optional
// address and transaction tabs also use it after the visitor opens a tab.
const explorerToolRoutes = new Set([
  "batches", "dispute-games", "gas-tracker", "name-services", "contract-verification", "public-tags", "op",
]);

export function usesExplorerTools(routeName: string) {
  return explorerToolRoutes.has(routeName);
}

const shareImagePath = "/brand/block-lens/share.png";

// The artwork is shared across networks. Its text alternative follows the page language.
const socialLocales: Record<Locale, { locale: string; imageAlt: string }> = {
  en: { locale: "en_US", imageAlt: "Ink Explorer wordmark and Block Lens sculpture." },
  zh: { locale: "zh_CN", imageAlt: "Ink Explorer 字标与 Block Lens 雕塑。" },
  hi: { locale: "hi_IN", imageAlt: "Ink Explorer का नाम और Block Lens की मूर्ति।" },
  es: { locale: "es_ES", imageAlt: "El nombre Ink Explorer y la escultura Block Lens." },
  fr: { locale: "fr_FR", imageAlt: "Le nom Ink Explorer et la sculpture Block Lens." },
  ar: { locale: "ar_EG", imageAlt: "اسم Ink Explorer ومنحوتة Block Lens." },
  bn: { locale: "bn_BD", imageAlt: "Ink Explorer-এর নাম ও Block Lens ভাস্কর্য।" },
  pt: { locale: "pt_PT", imageAlt: "O nome Ink Explorer e a escultura Block Lens." },
  ru: { locale: "ru_RU", imageAlt: "Надпись Ink Explorer и скульптура Block Lens." },
  ja: { locale: "ja_JP", imageAlt: "Ink Explorer のロゴタイプと Block Lens の彫刻。" },
};

type MetaTag = [attribute: "name" | "property", key: string, content: string];

export function socialPageMetadata({ origin, canonical, title, description, locale }: {
  origin: string; canonical: string; title: string; description: string; locale: Locale;
}): MetaTag[] {
  const image = new URL(shareImagePath, origin).href;
  const translation = socialLocales[locale];
  return [
    ["property", "og:type", "website"],
    ["property", "og:site_name", "Ink Explorer"],
    ["property", "og:locale", translation.locale],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", canonical],
    ["property", "og:image", image],
    ["property", "og:image:type", "image/png"],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", translation.imageAlt],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", title],
    ["name", "twitter:description", description],
    ["name", "twitter:image", image],
    ["name", "twitter:image:alt", translation.imageAlt],
  ];
}

// The statistics directory has two navigation URLs but one canonical document.
// Detail URLs remain separate, and callers keep the visited URL unchanged.
export function canonicalExplorerPath(pathname: string, basePath = ""): string {
  return pathname === `${basePath}/stats` ? `${basePath}/analytics` : pathname;
}

const staticRoutes: Record<string, string> = {
  "/": "home", "/search": "search", "/blocks": "blocks", "/txs": "transactions",
  "/tokens": "tokens", "/pools": "pools", "/contracts": "contracts", "/verified-contracts": "contracts",
  "/analytics": "analytics", "/advanced": "advanced", "/developers": "developers", "/network": "network",
  "/accounts": "accounts", "/internal-txs": "internal-txs", "/token-transfers": "token-transfers",
  "/deposits": "deposits", "/withdrawals": "withdrawals", "/batches": "batches", "/dispute-games": "dispute-games",
  "/ops": "ops", "/name-services": "name-services", "/gas-tracker": "gas-tracker", "/apps": "apps",
  "/contract-verification": "contract-verification", "/public-tags/submit": "public-tags", "/approvals": "approvals", "/stats": "stats",
};

export function validBlockRouteIdentifier(id: string): boolean {
  return /^0x[\da-f]{64}$/i.test(id) || /^\d{1,20}$/.test(id) && Number.isSafeInteger(Number(id));
}

// The HTTP shell and client router must agree about which paths exist. This
// validates catalogue membership for static apps and URL shape for chain records.
export function parseExplorerPath(pathname: string, basePath = ""): ExplorerRoute | null {
  if (staticRoutes[pathname]) return { name: staticRoutes[pathname], ...(pathname === "/public-tags/submit" ? { id: "submit" } : {}) };
  let match = pathname.match(/^\/(tx|op)\/(0x[\da-f]{64})$/i);
  if (match) return { name: match[1].toLowerCase() === "tx" ? "transaction" : "op", id: match[2] };
  match = pathname.match(/^\/block\/([^/]+)$/i);
  if (match && validBlockRouteIdentifier(match[1])) return { name: "block", id: match[1] };
  match = pathname.match(/^\/pools\/(0x(?:[\da-f]{40}|[\da-f]{64}))$/i);
  if (match) return { name: "pool", id: match[1] };
  match = pathname.match(/^\/(address|token|approvals)\/(0x[\da-f]{40})$/i);
  if (match) return { name: match[1].toLowerCase(), id: match[2] };
  match = pathname.match(/^\/token\/(0x[\da-f]{40})\/instance\/(0|[1-9]\d{0,77})$/i);
  if (match && BigInt(match[2]) < 2n ** 256n) return { name: "nft", id: match[1], tokenId: match[2] };
  match = pathname.match(/^\/batches\/(\d+)$/);
  if (match) return { name: "batches", id: match[1] };
  match = pathname.match(/^\/apps\/([a-zA-Z0-9_.-]{1,160})$/);
  if (match && (!isEcosystemAppId(match[1]) || ecosystemAppIdentity(match[1], basePath === "/testnet"))) {
    return { name: "apps", id: match[1] };
  }
  match = pathname.match(/^\/stats\/([a-zA-Z0-9_-]{1,120})$/);
  if (match) return { name: "stats", id: match[1] };
  match = pathname.match(/^\/name-services\/domains\/([a-zA-Z0-9_.%~-]{1,750})$/);
  if (match) {
    try {
      const name = decodeURIComponent(match[1]);
      if (!/[\u0000-\u0020\u007f/\\]/.test(name)) return { name: "name-services", id: `domains/${name}` };
    } catch { /* Malformed URI escapes are an invalid route, not a crash. */ }
  }
  return null;
}

export function pageStructuredData({ origin, basePath, canonical, title, description, locale }: {
  origin: string; basePath: string; canonical: string; title: string; description: string; locale: string;
}) {
  const websiteUrl = `${origin}${basePath}/`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${websiteUrl}#website`, name: "Ink Explorer", url: websiteUrl, image: new URL(shareImagePath, origin).href, publisher: {"@id": `${origin}/#publisher`},
        potentialAction: { "@type": "SearchAction", target: `${origin}${basePath}/search?q={search_term_string}`, "query-input": "required name=search_term_string" } },
      { "@type": "WebPage", "@id": `${canonical}#webpage`, url: canonical, name: title, description, inLanguage: locale, isPartOf: { "@id": `${websiteUrl}#website` } },
      { "@type": "Organization", "@id": `${origin}/#publisher`, name: "Ink Explorer", url: origin+"/", logo: new URL("/brand/block-lens/icon-512.png", origin).href },
    ],
  };
}

export function canonicalDocumentOrigin(doc: Document, fallback: string) {
  const href = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  try { return new URL(href || fallback).origin; } catch { return new URL(fallback).origin; }
}

export function updatePageMetadata({ doc, url, origin, basePath, locale, title, description, routeName, forceNoindex }: {
  doc: Document; url: URL; origin: string; basePath: string; locale: Locale; title: string; description: string; routeName: string; forceNoindex: boolean;
}) {
  doc.documentElement.lang = locale;
  doc.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  doc.title = title;
  const canonicalPath = canonicalExplorerPath(url.pathname, basePath);
  const canonical = new URL(canonicalPath, origin);
  if (locale !== "en") canonical.searchParams.set("lang", locale);
  let canonicalLink = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonicalLink) { canonicalLink = doc.createElement("link"); canonicalLink.rel = "canonical"; doc.head.append(canonicalLink); }
  canonicalLink.href = canonical.href;
  for (const link of doc.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')) {
    const alternate = new URL(canonicalPath, origin);
    if (link.hreflang !== "en" && link.hreflang !== "x-default") alternate.searchParams.set("lang", link.hreflang);
    link.href = alternate.href;
  }
  const robots = forceNoindex || routeName === "search" || routeName === "not-found" ? "noindex,follow" : "index,follow,max-image-preview:large";
  for (const [attribute, key, value] of [
    ["name", "description", description], ["name", "robots", robots],
    ...socialPageMetadata({ origin, canonical: canonical.href, title, description, locale }),
  ]) {
    let meta = doc.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!meta) { meta = doc.createElement("meta"); meta.setAttribute(attribute, key); doc.head.append(meta); }
    meta.content = value;
  }
  let structured = doc.querySelector<HTMLScriptElement>("#ink-page-schema");
  if (!structured) { structured = doc.createElement("script"); structured.id = "ink-page-schema"; structured.type = "application/ld+json"; doc.head.append(structured); }
  structured.textContent = JSON.stringify(pageStructuredData({ origin, basePath, canonical: canonical.href, title, description, locale })).replaceAll("<", "\\u003c");
}
