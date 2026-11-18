import { ecosystemAppIdentity } from "../src/ink-ecosystem-route.ts";
import { explorerCopy } from "../src/explorer-copy.ts";
import { explorerPageMetadata } from "../src/page-metadata.ts";
import localeMeta from "../src/locales/meta.json" with { type: "json" };
import { initialPageSnapshot, pageSnapshotContent } from "./page-snapshots.mjs";

/** Read a directory snapshot or compose an app document from its navigation and its own content. */
export async function readEcosystemDocument(url, basePath, readJson) {
  const list = url.pathname === "/apps";
  if (!list && !url.pathname.startsWith("/apps/")) return;
  const id = url.pathname.slice("/apps/".length);
  if (!list && !ecosystemAppIdentity(id, basePath === "/testnet")) return;
  const network = basePath === "/testnet" ? "sepolia" : "mainnet";
  const requested = url.searchParams.get("lang");
  const language = localeMeta.locales.includes(requested) ? requested : "en";
  const directory = `snapshots/ecosystem/${network}-${language}`;
  try {
    if (list) {
      const selection = initialPageSnapshot(url, network, language);
      const snapshot = await readJson(selection.path.slice(1));
      const content = pageSnapshotContent(snapshot, url.pathname, network, language, selection.neutral);
      if (!content) return;
      const translate = key => explorerCopy[language][key] ?? key;
      return { ...content, metadata: explorerPageMetadata(url, { basePath, locale: language, translate }) };
    }
    const [shell, app] = await Promise.all([
      readJson(`${directory}/shell.json`),
      readJson(`${directory}/${id}.json`),
    ]);
    if (shell?.network !== network || shell.language !== language || !Array.isArray(shell.styles)
      || typeof shell.before !== "string" || typeof shell.after !== "string"
      || app?.network !== network || app.language !== language || app.route !== url.pathname
      || typeof app.html !== "string" || typeof app.title !== "string" || typeof app.description !== "string") return;
    return {
      initialContent: shell.before + app.html + shell.after,
      initialStyles: shell.styles,
      metadata: [app.title, app.description],
    };
  } catch {
    // A partial or older build can still load the normal client and its recovery controls.
  }
}
