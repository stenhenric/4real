import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ensureScript } from './auth-turnstile-script.ts';

type Listener = () => void;

class FakeScript {
  id = '';
  src = '';
  async = false;
  defer = false;
  parentNode: FakeHead | null = null;
  private listeners = new Map<string, Listener>();

  addEventListener(event: string, listener: Listener) {
    this.listeners.set(event, listener);
  }

  removeEventListener(event: string) {
    this.listeners.delete(event);
  }

  dispatchEvent(event: string) {
    this.listeners.get(event)?.();
  }

  remove() {
    this.parentNode?.removeChild(this);
  }
}

class FakeHead {
  scripts: FakeScript[] = [];

  appendChild(script: FakeScript) {
    script.parentNode = this;
    this.scripts.push(script);
    return script;
  }

  removeChild(script: FakeScript) {
    this.scripts = this.scripts.filter(item => item !== script);
    script.parentNode = null;
  }
}

describe('ensureScript', () => {
  it('refetches the Turnstile script after a load failure', async () => {
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const head = new FakeHead();

    globalThis.window = {
      clearInterval,
      clearTimeout,
      setInterval,
      setTimeout,
    } as unknown as Window & typeof globalThis;
    globalThis.document = {
      createElement: (tagName: string) => {
        assert.equal(tagName, 'script');
        return new FakeScript();
      },
      getElementById: (id: string) => head.scripts.find(script => script.id === id) ?? null,
      head,
    } as unknown as Document;

    try {
      const firstLoad = ensureScript();
      const failedScript = head.scripts[0];
      failedScript?.dispatchEvent('error');
      await assert.rejects(firstLoad, { message: 'Failed to load Turnstile script' });

      const secondLoad = ensureScript();
      assert.equal(head.scripts.length, 1);
      assert.notEqual(head.scripts[0], undefined);
      assert.equal(head.scripts[0]?.src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');

      if (head.scripts[0] === failedScript) {
        head.scripts[0]?.dispatchEvent('error');
        await assert.rejects(secondLoad, { message: 'Failed to load Turnstile script' });
        assert.notEqual(head.scripts[0], failedScript);
        return;
      }

      globalThis.window.turnstile = {
        render: () => 'widget-id',
        reset: () => {},
        remove: () => {},
      };

      await secondLoad;
    } finally {
      if (originalWindow) {
        globalThis.window = originalWindow;
      } else {
        delete (globalThis as { window?: Window }).window;
      }

      if (originalDocument) {
        globalThis.document = originalDocument;
      } else {
        delete (globalThis as { document?: Document }).document;
      }
    }
  });
});
