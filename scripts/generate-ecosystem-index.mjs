import { writeFile } from "node:fs/promises";
import catalogue from "../src/ink-ecosystem.json" with { type: "json" };

// The router and document renderer only need application identity and network.
const index = catalogue.map(({ id, name, network }) => ({ id, name, network }));
await writeFile(new URL("../src/ink-ecosystem-index.json", import.meta.url), JSON.stringify(index) + "\n");
