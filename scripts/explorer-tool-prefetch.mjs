// Rolldown can extract shared code into separate chunks. Follow static imports
// only so opening a tool does not fetch optional wallet, locale or tab modules.
export function explorerToolPrefetchMarker(bundle) {
  const chunks = Object.values(bundle).filter(file => file.type === "chunk");
  const isToolsModule = id => id?.replaceAll("\\", "/").endsWith("/src/ExplorerPages.tsx");
  const tools = chunks.find(chunk => isToolsModule(chunk.facadeModuleId))
    ?? chunks.find(chunk => chunk.moduleIds.some(isToolsModule));
  if (!tools) throw new Error("Cannot find ExplorerPages in the browser bundle");

  function collect(fileName, visited) {
    const chunk = bundle[fileName];
    if (chunk?.type !== "chunk" || visited.has(fileName)) return;
    visited.add(fileName);
    for (const dependency of chunk.imports) collect(dependency, visited);
  }

  const initial = new Set();
  for (const chunk of chunks) if (chunk.isEntry) collect(chunk.fileName, initial);
  const required = new Set();
  collect(tools.fileName, required);
  const paths = [...required].filter(file => !initial.has(file)).map(file => "/" + file);
  if (paths.some(path => !/^\/assets\/[a-zA-Z0-9_-]+\.js$/.test(path))) {
    throw new Error("Explorer tool scripts must use local build asset paths");
  }
  return paths.length ? `<!-- ink-tool-scripts: ${paths.join(" ")} -->` : "";
}
