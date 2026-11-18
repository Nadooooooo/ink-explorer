import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {themeBootstrapHash} from "./server/theme-bootstrap-policy.mjs";
import {replaceStartupShell} from "./server/startup-shell.mjs";

function embedThemeBootstrap(html:string) {
  const script=readFileSync(new URL("./public/theme.js",import.meta.url),"utf8");
  const hash="sha256-"+createHash("sha256").update(script).digest("base64");
  if(hash!==themeBootstrapHash||/<\/script|<!--/i.test(script))throw new Error("Theme bootstrap must match its exact CSP hash");
  const external='<script src="/theme.js"></script>';
  if(!html.includes(external))throw new Error("Theme bootstrap insertion point is missing");
  return replaceStartupShell(html.replace(external,`<script data-theme-bootstrap>${script}</script>`));
}

export default defineConfig({
  plugins: [{name:"early-theme",transformIndexHtml:{order:"pre",handler:embedThemeBootstrap}}, { name:"browser-locale-catalogue", enforce:"pre", resolveId(source,importer) { if(source === "./i18n" && importer?.includes("/src/")) return new URL("./src/i18n-browser.ts",import.meta.url).pathname; } },react()],
  // Keep fonts and small images cacheable and compatible with the strict CSP.
  // Failed modulepreloads can poison WebKit's resource cache across reloads
  // (WebKit #270357). Native module imports still cache successful chunks and
  // allow the independent document shell to recover after a failed download.
  build: { assetsInlineLimit: 0, modulePreload: false, rolldownOptions: { output: {
    // Retire URLs that an already-open WebKit tab may have cached as failed.
    // Successful chunks keep stable, content-hashed URLs on future builds.
    chunkFileNames: 'assets/module-[name]-[hash].js',
    // Keep the entry's static dependency chain in one request without restoring
    // modulepreloads that can poison WebKit's failed-resource cache. Deferred
    // route and wallet modules remain separate.
    codeSplitting: { groups: [{ name: 'initial', tags: ['$initial'] }] },
  } } },
  server: { proxy: { "/api": "http://127.0.0.1:4188" } },
});
