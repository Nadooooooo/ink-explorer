import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ecosystemAppId } from "../src/ink-ecosystem-route.ts";

/** Capture the same React details users see, reusing the open directory and its loaded assets. */
export async function prerenderEcosystemDetails(page, network, language, catalogue) {
  const prefix = network === "sepolia" ? "/testnet" : "";
  const routes = catalogue.filter(app => !prefix || app.network === "Both").map(app => ({
    name: app.name, id: ecosystemAppId(app.id),
  }));
  const { shell, documents } = await page.evaluate(async ({ routes, prefix, language, network }) => {
    const root = document.querySelector("#root");
    let shell;
    const documents = [];
    for (const { name, id } of routes) {
      const route = "/apps/" + id;
      const pathname = prefix + route;
      history.replaceState(null, "", pathname + "?lang=" + language);
      dispatchEvent(new PopStateEvent("popstate"));
      // The router commits the body and the document metadata in separate effects.
      // Both must identify this app before capturing a shareable document.
      const deadline = performance.now() + 10000;
      while (root.querySelector(".explorer-page h1")?.textContent !== name
        || !root.querySelector(".ecosystem-detail")
        || new URL(document.querySelector('link[rel="canonical"]').href).pathname !== pathname) {
        if (performance.now() > deadline) throw new Error("App document did not settle: " + pathname);
        await new Promise(requestAnimationFrame);
      }
      const main = root.querySelector("#main-content");
      main.dataset.initialPage = route;
      main.removeAttribute("aria-busy");
      const html = main.outerHTML;
      if (!shell) {
        const [before, after] = root.innerHTML.split(html);
        if (!before || !after) throw new Error("App navigation shell is incomplete");
        const styles = [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => new URL(link.href).pathname);
        shell = { network, language, before, after, styles };
      }
      documents.push({ id, network, language, route, html, title: document.title,
        description: document.querySelector('meta[name="description"]').content });
    }
    return { shell, documents };
  }, { routes, prefix, language, network });

  // Each HTTP response reads only its localized navigation and the requested
  // app. Storing the navigation once avoids repeating it in hundreds of files.
  const directory = path.join("dist", "snapshots", "ecosystem", network + "-" + language);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "shell.json"), JSON.stringify(shell));
  for (const { id, ...document } of documents) {
    await writeFile(path.join(directory, id + ".json"), JSON.stringify(document));
  }
}
