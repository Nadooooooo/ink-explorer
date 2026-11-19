import { canonicalExplorerPath, pageStructuredData, parseExplorerPath, socialPageMetadata, usesExplorerTools } from "../src/page-seo.ts";
import { defaultPageMetadata, notFoundPageCopy } from "../src/page-metadata.ts";
import { ecosystemAppId } from "../src/ink-ecosystem-route.ts";
import ecosystemIndex from "../src/ink-ecosystem-index.json" with { type: "json" };
import localeMeta from "../src/locales/meta.json" with { type: "json" };
import { themeBootstrapHash } from "./theme-bootstrap-policy.mjs";
import { replaceStartupShell } from "./startup-shell.mjs";

export const documentHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "content-security-policy": `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src https://verify.walletconnect.org https://secure.walletconnect.org https://verify.walletconnect.com https://secure.walletconnect.com; script-src 'self' '${themeBootstrapHash}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://inkonchain.com/featured-apps/icons/ https://cdn.sanity.io/images/51n36hrp/facade/a925939f448a3a410f4f32334165623ad4cccba1-512x512.svg; connect-src 'self' ws: wss: https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com https://rpc-gel.inkonchain.com https://rpc-gel-sepolia.inkonchain.com; form-action 'self'`,
};

const supportedLanguages = localeMeta.locales;
const sitemapPaths = [
  "/",
  "/blocks",
  "/txs",
  "/tokens",
  "/pools",
  "/contracts",
  "/analytics",
  "/advanced",
  "/developers",
  "/network",
  "/accounts", "/internal-txs", "/token-transfers", "/deposits", "/withdrawals",
  "/batches", "/dispute-games", "/ops", "/name-services", "/gas-tracker", "/apps",
  "/contract-verification", "/public-tags/submit", "/approvals",
];

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}


function localizedCanonical(origin, url, language, basePath) {
  const canonical = new URL(canonicalExplorerPath(`${basePath}${url.pathname}`, basePath), origin);
  if (language !== "en") canonical.searchParams.set("lang", language);
  return canonical.href;
}

export function renderPage(template, requestUrl, { origin, basePath = "", metadata, forceNoindex = false, initialContent = "", initialStyles = [] }) {
  const networkName = basePath === "/testnet" ? "Ink Sepolia" : "Ink Mainnet";
  let responseStatus = 200;
  const language = supportedLanguages.includes(
    requestUrl.searchParams.get("lang"),
  )
    ? requestUrl.searchParams.get("lang")
    : "en";
  const defaultMetadata = defaultPageMetadata(requestUrl.pathname, basePath).map(value => value.replaceAll("Ink Mainnet", networkName));
  const missing = defaultMetadata[0].startsWith("Page not found");
  const [missingHeading, missingDescription] = notFoundPageCopy(language);
  const [rawTitle, description] = missing ? [`${missingHeading} — Ink Explorer`, missingDescription] : metadata || defaultMetadata;
  // Distinct Mainnet and Sepolia URLs need distinct titles in both the HTTP
  // shell and browser metadata, even when the translated route label is shared.
  const title = basePath === "/testnet" && !rawTitle.includes(networkName)
    ? `${rawTitle} · ${networkName}` : rawTitle;
  const preloadPath = requestUrl.pathname === "/" ? "/api/overview" : requestUrl.pathname === "/blocks" ? `/api/explorer/blocks${requestUrl.searchParams.get("type") === "reorg" ? "?type=reorg" : ""}` : "";
  const preload = preloadPath
    ? `<link rel="preload" href="${basePath}${preloadPath}" as="fetch" crossorigin="anonymous" />`
    : "";
  const robots =
    forceNoindex || missing || requestUrl.pathname === "/search"
      ? "noindex,follow"
      : "index,follow,max-image-preview:large";
  if (missing) responseStatus = 404;
  const canonical = localizedCanonical(origin, requestUrl, language, basePath);
  const alternates = supportedLanguages
    .map(
      (code) =>
        `<link rel="alternate" hreflang="${code}" href="${escapeHtml(localizedCanonical(origin, requestUrl, code, basePath))}" />`,
    )
    .join("");
  const structured = JSON.stringify(pageStructuredData({ origin, basePath, canonical, title, description, locale: language })).replaceAll("<", "\\u003c");
  const socialTags = socialPageMetadata({ origin, canonical, title, description, locale: language })
    .map(([attribute, key, value]) => `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`)
    .join("");
  let html = template
    .toString("utf8")
    .replace(/<!-- ink-tool-scripts: ([^>]*?) -->/, (_, files) => {
      if (!usesExplorerTools(parseExplorerPath(requestUrl.pathname, basePath)?.name ?? "")) return "";
      const scripts = [...new Set(files.split(" "))].filter(path => /^\/assets\/[a-zA-Z0-9_-]+\.js$/.test(path));
      // Prefetch warms the HTTP cache where supported. A failed script preload
      // can survive a reload in WebKit and block the later native import.
      return scripts.map(path => `<link rel="prefetch" as="script" crossorigin="anonymous" href="${path}" />`).join("");
    })
    .replace(
      /<html lang="[^"]+"(?: dir="[^"]+")?>/,
      `<html lang="${language}" dir="${language === "ar" ? "rtl" : "ltr"}"${forceNoindex ? ' data-robots-policy="noindex"' : ""}>`,
    )
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*"\s*\/>/,
      () => `<meta name="description" content="${escapeHtml(description)}" />`,
    );
  html = html.replace(
    "</head>",
    () => `<link rel="canonical" href="${escapeHtml(canonical)}" />${alternates}<meta name="robots" content="${robots}" />${socialTags}<script id="ink-page-schema" type="application/ld+json">${structured}</script></head>`,
  );
  html = html.replace("</head>", `${preload}</head>`);
  const styles = [...new Set(initialStyles)].filter(path => /^\/assets\/[a-zA-Z0-9_-]+\.css$/.test(path) && !html.includes(`href="${path}"`));
  html = html.replace('</head>', styles.map(path => `<link rel="stylesheet" href="${path}" />`).join('') + '</head>');
  html = replaceStartupShell(html, language, initialContent, { notFound: missing, basePath });
  return { body: Buffer.from(html), status: responseStatus, robots };
}

export function robotsText(origin, basePath = "") {
  const networks = basePath ? [basePath] : ["", "/testnet"];
  return [
    "User-agent: *",
    "Allow: /",
    // Initial content remains crawlable; a crawler never needs a live stream.
    ...networks.map((prefix) => `Disallow: ${prefix}/api/live`),
    ...networks.map((prefix) => `Sitemap: ${origin}${prefix}/sitemap.xml`),
    "",
  ].join("\n");
}

export function sitemapXml(origin, basePath = "") {
  const appPaths = ecosystemIndex
    .filter(app => basePath !== "/testnet" || app.network === "Both")
    .map(app => `/apps/${ecosystemAppId(app.id)}`);
  const entries = [...sitemapPaths, ...appPaths]
    .flatMap((route) =>
      supportedLanguages.map(
        (language) =>
          `<url><loc>${escapeHtml(localizedCanonical(origin, new URL(route, origin), language, basePath))}</loc><changefreq>${route === "/" ? "hourly" : "daily"}</changefreq><priority>${route === "/" ? "1.0" : "0.8"}</priority></url>`,
      ),
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
}
