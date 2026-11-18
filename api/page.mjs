import { readFile } from "node:fs/promises";
import path from "node:path";
import { documentHeaders, renderPage, robotsText, sitemapXml } from "../server/page-document.mjs";
import { readEcosystemDocument } from "../server/ecosystem-document.mjs";

function pageUrl(req) {
  const requestUrl = new URL(req.url, "https://page.invalid");
  const route = requestUrl.pathname === "/api/page"
    ? req.query?.path ?? requestUrl.searchParams.get("path")
    : req.url.split("?")[0];
  if (typeof route !== "string" || !/^\/(?!\/)/.test(route)) throw new Error("Invalid page route");
  const decoded = decodeURIComponent(route);
  if (/[?#\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//") ||
      decoded.split("/").some((part) => part === "." || part === "..")) throw new Error("Invalid page route");
  const url = new URL(route, "https://page.invalid");
  url.search = requestUrl.search;
  url.searchParams.delete("path");
  if (!url.searchParams.has("lang") && typeof req.query?.lang === "string") url.searchParams.set("lang", req.query.lang);
  return url;
}

function pageOrigin(req) {
  if (process.env.PUBLIC_URL) {
    const origin = new URL(process.env.PUBLIC_URL);
    if (!/^https?:$/.test(origin.protocol) || origin.username || origin.password ||
        origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Invalid public origin");
    return origin.origin;
  }
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) throw new Error("Invalid public host");
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  if (protocol !== "http" && protocol !== "https") throw new Error("Invalid public protocol");
  return new URL(`${protocol}://${host}`).origin;
}

export default async function handler(req, res) {
  const send = (status, body, headers = {}) => {
    res.writeHead(status, {
      ...documentHeaders,
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    });
    res.end(req.method === "HEAD" ? undefined : body);
  };
  if (!["GET", "HEAD"].includes(req.method)) return send(405, "Method not allowed", { allow: "GET, HEAD" });
  let url, origin;
  try {
    url = pageUrl(req);
    origin = pageOrigin(req);
  } catch {
    return send(400, "Invalid page request");
  }
  const basePath = /^\/testnet(?:\/|$)/.test(url.pathname) ? "/testnet" : "";
  if (basePath) url.pathname = url.pathname.slice(basePath.length) || "/";
  if (url.pathname === "/robots.txt") return send(200, robotsText(origin, basePath), { "cache-control": "public, max-age=3600" });
  if (url.pathname === "/sitemap.xml") return send(200, sitemapXml(origin, basePath), {
    "content-type": "application/xml; charset=utf-8",
    "cache-control": "public, max-age=3600",
  });
  try {
    const dist = path.join(process.cwd(), "dist");
    const template = await readFile(path.join(dist, "index.html"));
    const ecosystem = await readEcosystemDocument(url, basePath, async asset =>
      JSON.parse(await readFile(path.join(dist, asset), "utf8")));
    const page = renderPage(template, url, { origin, basePath, ...ecosystem });
    return send(page.status, page.body, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
      "x-robots-tag": page.robots,
    });
  } catch {
    return send(503, "Page temporarily unavailable", { "retry-after": "30" });
  }
}
