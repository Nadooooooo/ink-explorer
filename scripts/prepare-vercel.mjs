import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function prepareVercel(dist = path.resolve("dist")) {
  if (!(await stat(path.join(dist, "index.html"))).isFile()) throw new Error("Built index.html is required");
  const output = path.join(dist, "static");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const entry of await readdir(dist, { withFileTypes: true })) {
    if (entry.name === "index.html" || entry.name === "static") continue;
    await cp(path.join(dist, entry.name), path.join(output, entry.name), { recursive: true });
  }
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(`Vercel static assets prepared in ${await prepareVercel()}`);
}
