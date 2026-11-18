import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initialBuildAssets } from './initial-build-assets.mjs';

test('deployment acceptance covers transitive imports and reexports, ignores comments and deferred imports, terminates cycles', async () => {
  const dist = await mkdtemp(path.join(tmpdir(), 'ink-build-graph-'));
  try {
    await mkdir(path.join(dist, 'assets'));
    const modules = {
      'entry.js': `import './shared.js'; export { thing } from './named.js'; export * from './star.js'; import('./deferred.js'); // import './comment.js'`,
      'shared.js': `import './deep.js';`,
      'deep.js': `import './entry.js';`,
      'named.js': `export const thing = 1;`,
      'star.js': `export * from './deep.js';`,
    };
    for (const [name, source] of Object.entries(modules)) await writeFile(path.join(dist, 'assets', name), source);
    assert.deepEqual(await initialBuildAssets(dist, ['/assets/entry.js', '/assets/style.css']), ['/assets/entry.js', '/assets/style.css', '/assets/shared.js', '/assets/named.js', '/assets/star.js', '/assets/deep.js']);
    await writeFile(path.join(dist, 'assets/deep.js'), `import './missing.js';`);
    await assert.rejects(initialBuildAssets(dist, ['/assets/entry.js']), /ENOENT/);
  } finally { await rm(dist, { recursive: true, force: true }); }
});
