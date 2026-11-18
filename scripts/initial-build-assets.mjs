import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { init, parse } from 'es-module-lexer';

// All eager JavaScript dependencies must be present after a deployment, not
// only the files named in HTML. A lexer avoids mistaking comments for imports.
export async function initialBuildAssets(dist, directAssets) {
  await init;
  const assets = [...new Set(directAssets)];
  for (const asset of assets) {
    assert(asset.startsWith('/assets/'), 'Unexpected build asset path');
    if (!asset.endsWith('.js')) continue;
    const [imports] = parse(await readFile(path.join(dist, asset), 'utf8'));
    for (const imported of imports) {
      assert.equal(typeof imported.type, 'string', 'Unexpected module lexer result schema');
      if (!['static', 'reexport-star'].includes(imported.type) || !imported.specifier?.startsWith('.')) continue;
      const dependency = new URL(imported.specifier, `https://build.invalid${asset}`).pathname;
      assert(dependency.startsWith('/assets/'), 'Unexpected static module outside build assets');
      if (!assets.includes(dependency)) assets.push(dependency);
    }
  }
  return assets;
}
