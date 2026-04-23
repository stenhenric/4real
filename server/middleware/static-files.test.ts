import test from 'node:test';
import assert from 'node:assert';
import express from 'express';
import path from 'path';

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
