import { Buffer } from "node:buffer";
import { documentHeaders, renderPage, robotsText, sitemapXml } from "../server/page-document.mjs";
import { publicApiPath, allowedPublicMethod } from "../server/public-proxy.mjs";
import { isLocale, message, formatMessage } from "../src/i18n.ts";
import { explorerPageMetadata } from "../src/page-metadata.ts";
import { chartDescription } from "../src/chart-descriptions.ts";
import { counterTitle } from "../src/counter-titles.ts";
import { initialPageSnapshot, pageSnapshotContent } from "../server/page-snapshots.mjs";
import { readEcosystemDocument } from "../server/ecosystem-document.mjs";
import { recordRoute } from "../src/record-arrival.ts";
import { loadRecordArrival, fillRecordShell, serializeRecord } from "../server/record-arrival.mjs";

const canonicalOrigin = "https://inkexplorer.xyz";
const apiPattern = /^\/(?:testnet\/)?api\//;
const staticPattern = /^\/(?:assets\/|brand\/|licenses\/|theme\.js$|manifest\.webmanifest$|favicon\.ico$)/;


function textResponse(status, body, headers = {}) {
  return new Response(body, { status, headers: { ...documentHeaders, "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...headers } });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const origin = env.PUBLIC_URL || canonicalOrigin;
  if (url.hostname === "www.inkexplorer.xyz" || (url.hostname === "inkexplorer.xyz" && url.protocol !== "https:")) {
    return Response.redirect(origin + url.pathname + url.search, 308);
  }
  // Both client navigation and shared links accept a trailing slash. Redirect
  // document variants to the same canonical path rather than serving a 404 shell.
  if (!apiPattern.test(url.pathname) && !staticPattern.test(url.pathname) && url.pathname !== "/" && url.pathname !== "/testnet/" && /\/$/.test(url.pathname)) {
    const path = url.pathname.replace(/\/+$/, "");
    return Response.redirect(origin + (path === "/testnet" ? "/testnet/" : path || "/") + url.search, 308);
  }
  if (url.pathname === "/index.html" || url.pathname === "/testnet/index.html" || url.pathname === "/testnet") {
    return Response.redirect(origin + (url.pathname.startsWith("/testnet") ? "/testnet/" : "/") + url.search, 308);
  }
  if (url.pathname === "/verified-contracts" || url.pathname === "/testnet/verified-contracts") {
    return Response.redirect(origin + url.pathname.replace("/verified-contracts", "/contracts") + url.search, 308);
  }
  if (apiPattern.test(url.pathname)) {
    let path;
    try { path = publicApiPath(url.pathname + url.search); }
    catch { return textResponse(400, "Invalid API path"); }
    if (!allowedPublicMethod(path, request.method)) return textResponse(405, "Method not allowed", { allow: "GET, HEAD", "x-robots-tag": "noindex, nofollow" });
    if (url.pathname.endsWith("/api/live/config")) {
      const socket = new URL(url.pathname.replace(/\/config$/, ""), url.origin);
      socket.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return Response.json({ url: socket.href }, { headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
    }
    if (!env.API_ORIGIN || !env.ORIGIN_TOKEN) return textResponse(503, "Explorer API is not configured", { "retry-after": "60" });
    if (Number(request.headers.get("content-length") || 0) > 4 * 1024 * 1024) return textResponse(413, "Request exceeds the hosting limit");
    const headers = new Headers({ "x-ink-origin-token": env.ORIGIN_TOKEN });
    for (const key of ["accept", "content-type", "origin", "upgrade", "sec-websocket-key", "sec-websocket-version", "sec-websocket-protocol"]) {
      if (request.headers.has(key)) headers.set(key, request.headers.get(key));
    }
    try {
      const target = new URL(env.API_ORIGIN + path);
      const upstream = await fetch(target, {
        method: request.method, headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        // The same renderer runs under Node on the public site. Native fetch
        // requires duplex for the Request body's ReadableStream.
        duplex: "half",
        redirect: "manual", signal: request.headers.get("upgrade")?.toLowerCase() === "websocket" ? undefined : AbortSignal.timeout(55000),
      });
      if (upstream.status >= 300 && upstream.status < 400) throw new Error("Unexpected upstream redirect");
      if (upstream.status === 101) return upstream;
      const responseHeaders = new Headers({ "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff" });
      for (const key of ["content-type", "cache-control", "etag", "retry-after", "x-media-cache", "x-ink-data-status", "x-ink-data-fetched-at"]) {
        if (upstream.headers.has(key)) responseHeaders.set(key, upstream.headers.get(key));
      }
      const linesCatalog = url.pathname === "/api/stats/lines" || url.pathname === "/testnet/api/stats/lines";
      const countersCatalog = url.pathname === "/api/stats/counters" || url.pathname === "/testnet/api/stats/counters";
      if ((linesCatalog || countersCatalog) && upstream.ok) {
        // These small metadata responses contain upstream wording that needs
        // correcting. Preserve every observation and all other fields.
        responseHeaders.delete("etag");
        if (request.method === "GET" && responseHeaders.get("content-type")?.includes("application/json")) {
          const original = await upstream.text();
          try {
            const catalog = JSON.parse(original);
            let changed = false;
            if (linesCatalog && Array.isArray(catalog?.sections)) for (const section of catalog.sections) {
              if (!Array.isArray(section?.charts)) continue;
              for (const chart of section.charts) {
                if (typeof chart?.description !== "string") continue;
                const corrected = chartDescription(chart.id, chart.description);
                if (corrected !== chart.description) { chart.description = corrected; changed = true; }
              }
            }
            if (countersCatalog && Array.isArray(catalog?.counters)) for (const counter of catalog.counters) {
              if (typeof counter?.title !== "string") continue;
              const corrected = counterTitle(counter.id, counter.title);
              if (corrected !== counter.title) { counter.title = corrected; changed = true; }
            }
            return new Response(changed ? JSON.stringify(catalog) : original, { status: upstream.status, headers: responseHeaders });
          } catch { return new Response(original, { status: upstream.status, headers: responseHeaders }); }
        }
      }
      return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch (error) {
      console.error("Explorer API transport failed:", error instanceof Error ? error.message : "Unknown transport error");
      return Response.json({ error: "apiConnectionFailed" }, { status: 502, headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
    }
  }
  if (!["GET", "HEAD"].includes(request.method)) return textResponse(405, "Method not allowed", { allow: "GET, HEAD" });
  if (staticPattern.test(url.pathname)) {
    const asset = await env.ASSETS.fetch(request);
    if (!asset.ok) return textResponse(404, "Asset not found");
    const headers = new Headers(asset.headers);
    for (const [key, value] of Object.entries(documentHeaders)) headers.set(key, value);
    headers.set("vary", "Accept-Encoding");
    headers.set("cache-control", /^\/assets\/(?:marks\/[a-f0-9]+\.[a-z0-9]+|[^/]+-[a-zA-Z0-9_-]+\.[a-z0-9]+)$/.test(url.pathname) ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    return new Response(request.method === "HEAD" ? null : asset.body, { status: asset.status, headers });
  }
  const route = new URL(url);
  const basePath = /^\/testnet(?:\/|$)/.test(route.pathname) ? "/testnet" : "";
  if (basePath) route.pathname = route.pathname.slice(basePath.length) || "/";
  if (route.pathname === "/robots.txt") return textResponse(200, robotsText(origin, basePath), { "cache-control": "public, max-age=3600" });
  if (route.pathname === "/sitemap.xml") return textResponse(200, sitemapXml(origin, basePath), { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" });
  const template = await env.ASSETS.fetch(new Request(new URL("/index.html", url)));
  if (!template.ok) return textResponse(503, "Explorer build unavailable");
  let initialContent = '', initialStyles = [], initialRecord;
  const requestedLanguage = route.searchParams.get('lang');
  const language = isLocale(requestedLanguage) ? requestedLanguage : 'en';
  if (route.pathname === '/') {
    const snapshot = await env.ASSETS.fetch(new Request(new URL(`/snapshots/home-${basePath ? 'sepolia' : 'mainnet'}-${language}.html`, url)));
    if (snapshot.ok) initialContent = await snapshot.text();
  } else {
    const selection = initialPageSnapshot(route, basePath ? 'sepolia' : 'mainnet', language);
    if (selection && route.pathname !== '/apps') {
      const response = await env.ASSETS.fetch(new Request(new URL(selection.path, url)));
      if (response.ok) {
        try {
          const snapshot = await response.json();
          const content = pageSnapshotContent(snapshot, route.pathname, basePath ? 'sepolia' : 'mainnet', language, selection.neutral);
          if (content) {
            initialContent = content.initialContent;
            initialStyles = content.initialStyles;
          }
        } catch { /* A missing/corrupt snapshot preserves the independent fallback. */ }
      }
    }
    const detail=recordRoute(route.pathname);
    if(detail){
      const response=await env.ASSETS.fetch(new Request(new URL(`/snapshots/records/${detail.kind}-${basePath?'sepolia':'mainnet'}-${language}.json`,url)));
      if(response.ok){
        try{
          const snapshot=await response.json();
          const observation=await loadRecordArrival({pathname:route.pathname,basePath},env);
          const filled=observation&&fillRecordShell(snapshot,observation,language,basePath);
          if(filled){initialContent=filled.html;initialStyles=filled.styles;initialRecord=observation;}
        }catch{/* Keep independent startup recovery if the record shell is damaged. */}
      }
    }
  }
  const ecosystem = await readEcosystemDocument(route, basePath, async asset => {
    const response = await env.ASSETS.fetch(new Request(new URL('/' + asset, url)));
    return response.ok ? response.json() : null;
  });
  const page = renderPage(Buffer.from(await template.arrayBuffer()), route, { origin, basePath, initialContent, initialStyles, metadata: explorerPageMetadata(route, { basePath, locale: language, translate: key => message(language, key), format: (key, values) => formatMessage(language, key, values) }), ...ecosystem, forceNoindex: url.hostname.endsWith(".workers.dev") });
  const body=initialRecord?page.body.toString().replace('</head>',()=>`<script id="ink-initial-record" type="application/json">${serializeRecord(initialRecord)}</script></head>`):page.body;
  const unavailable=initialRecord?.phase==='unavailable';
  return new Response(request.method === "HEAD" ? null : body, {
    status: unavailable?503:page.status,
    headers: { ...documentHeaders, ...(env.DEPLOYMENT?.id ? { "x-ink-version": env.DEPLOYMENT.id } : {}), ...(unavailable?{'retry-after':'3'}:{}), "content-type": "text/html; charset=utf-8", "cache-control": initialRecord?'no-store':"no-cache", "x-robots-tag": url.hostname.endsWith(".workers.dev") ? "noindex, nofollow" : page.robots },
  });
}

export default { fetch: handleRequest };
