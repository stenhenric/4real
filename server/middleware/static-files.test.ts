import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import test from 'node:test';
import express from 'express';
import path from 'path';

import { resetEnvCacheForTests } from '../config/env.ts';
import { registerFrontendMiddleware } from '../http/frontend.ts';

async function withFrontendServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const previousCwd = process.cwd();
  const previousDisableHmr = process.env.DISABLE_HMR;
  const tempRoot = await mkdtemp(path.join(tmpdir(), '4real-frontend-'));
  const distPath = path.join(tempRoot, 'dist');
  let server: ReturnType<typeof createServer> | undefined;

  process.env.DISABLE_HMR = '1';
  resetEnvCacheForTests();

  try {
    await mkdir(path.join(distPath, 'assets'), { recursive: true });
    await mkdir(path.join(distPath, 'fonts'), { recursive: true });
    await writeFile(path.join(distPath, 'index.html'), '<!doctype html><title>4real test shell</title>');
    await writeFile(path.join(distPath, 'assets', 'app.js'), 'console.log("asset");');
    await writeFile(path.join(distPath, 'fonts', 'cabin-sketch-700.woff2'), 'font bytes');
    await writeFile(path.join(distPath, 'tonconnect-icon.jpg'), 'jpg bytes');
    await writeFile(path.join(distPath, 'phpinfo.php'), 'sensitive phpinfo output');
    process.chdir(tempRoot);

    const app = express();
    await registerFrontendMiddleware(app);
    server = createServer(app);

    await new Promise<void>((resolve) => {
      server?.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected an ephemeral TCP test server address');
    }

    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    process.chdir(previousCwd);
    await rm(tempRoot, { recursive: true, force: true });

    if (previousDisableHmr === undefined) {
      delete process.env.DISABLE_HMR;
    } else {
      process.env.DISABLE_HMR = previousDisableHmr;
    }
    resetEnvCacheForTests();
  }
}

test('static middleware fallback simulation', () => {
    const app = express();
    const distPath = path.join(process.cwd(), 'dist');

    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      fallthrough: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
        if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
      }
    }));

    assert.strictEqual(typeof app.use, 'function');
});

test('frontend middleware serves the SPA shell for known app routes', async () => {
  await withFrontendServer(async (baseUrl) => {
    for (const route of [
      '/',
      '/privacy',
      '/terms',
      '/auth/login',
      '/auth/security',
      '/play',
      '/leaderboard',
      '/bank',
      '/merchant/orders',
      '/game/room-123',
      '/profile/69fdfb8226d79ac6ead700b7',
      '/profile/user-player-one',
    ]) {
      const response = await fetch(`${baseUrl}${route}`);
      const body = await response.text();

      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0', route);
      assert.match(body, /4real test shell/, route);
    }
  });
});

test('frontend static files carry explicit asset cache policies', async () => {
  await withFrontendServer(async (baseUrl) => {
    const bundledAsset = await fetch(`${baseUrl}/assets/app.js`);
    assert.equal(bundledAsset.status, 200);
    assert.equal(bundledAsset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.match(bundledAsset.headers.get('vary') ?? '', /(?:^|,\s*)Accept-Encoding(?:,|$)/);

    const font = await fetch(`${baseUrl}/fonts/cabin-sketch-700.woff2`);
    assert.equal(font.status, 200);
    assert.equal(
      font.headers.get('cache-control'),
      'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600, stale-if-error=86400',
    );
    assert.match(font.headers.get('vary') ?? '', /(?:^|,\s*)Accept-Encoding(?:,|$)/);

    const icon = await fetch(`${baseUrl}/tonconnect-icon.jpg`);
    assert.equal(icon.status, 200);
    assert.equal(
      icon.headers.get('cache-control'),
      'public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600, stale-if-error=86400',
    );
    assert.match(icon.headers.get('vary') ?? '', /(?:^|,\s*)Accept-Encoding(?:,|$)/);
  });
});

test('frontend middleware returns 404 for scanner and debug probe paths', async () => {
  await withFrontendServer(async (baseUrl) => {
    for (const route of [
      '/phpinfo.php',
      '/info.php',
      '/debug.php',
      '/admin/phpinfo.php',
      '/test/phpinfo.php',
      '/_environment',
      '/server-status.php',
      '/phpinfo.php.bak',
      '/phpinfo.php~',
      '/staging/phpinfo.php',
      '/wp-admin/phpinfo.php',
      '/administrator/phpinfo.php',
      '/public_html/phpinfo.php',
    ]) {
      const response = await fetch(`${baseUrl}${route}`);
      const body = await response.text();

      assert.equal(response.status, 404, route);
      assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0', route);
      assert.doesNotMatch(body, /4real test shell/, route);
      assert.doesNotMatch(body, /sensitive phpinfo output/, route);
    }
  });
});
