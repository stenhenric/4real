import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('production entrypoints', () => {
  it('start-production helper imports the built server artifact', () => {
    const script = readFileSync('scripts/start-production.mjs', 'utf8');

    assert.match(script, /dist\/server\/main\.js/);
    assert.doesNotMatch(script, /import\(['"]\.\.\/main\.ts['"]\)/);
  });

  it('package start script runs the built server artifact', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> };

    assert.equal(packageJson.scripts?.start, 'node ./dist/server/main.js');
  });

  it('package typecheck script includes the server TypeScript project', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> };

    assert.match(packageJson.scripts?.typecheck ?? '', /tsc --project tsconfig\.server\.json --noEmit/);
    assert.equal(packageJson.scripts?.lint, 'npm run typecheck');
  });
});
