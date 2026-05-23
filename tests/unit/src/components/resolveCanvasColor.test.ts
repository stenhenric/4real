import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCanvasColor } from '../../../../src/canvas/resolveCanvasColor.ts';

describe('resolveCanvasColor', () => {
  it('resolves CSS custom properties to concrete canvas colors', () => {
    const originalDocument = globalThis.document;
    const originalGetComputedStyle = globalThis.getComputedStyle;

    globalThis.document = { documentElement: {} } as Document;
    globalThis.getComputedStyle = ((() => ({
      getPropertyValue: (name: string) => name === '--color-ink-black' ? '#1a1a1a' : '',
    })) as unknown) as typeof getComputedStyle;

    try {
      assert.equal(resolveCanvasColor('var(--color-ink-black)', '#000000'), '#1a1a1a');
    } finally {
      if (originalDocument) {
        globalThis.document = originalDocument;
      } else {
        delete (globalThis as { document?: Document }).document;
      }

      if (originalGetComputedStyle) {
        globalThis.getComputedStyle = originalGetComputedStyle;
      } else {
        delete (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle;
      }
    }
  });

  it('leaves explicit concrete colors unchanged', () => {
    assert.equal(resolveCanvasColor('#ff0000', '#000000'), '#ff0000');
  });

  it('falls back without crashing outside browser-like environments', () => {
    const originalDocument = globalThis.document;
    const originalGetComputedStyle = globalThis.getComputedStyle;

    delete (globalThis as { document?: Document }).document;
    delete (globalThis as { getComputedStyle?: typeof getComputedStyle }).getComputedStyle;

    try {
      assert.equal(resolveCanvasColor('var(--missing)', '#000000'), '#000000');
    } finally {
      if (originalDocument) {
        globalThis.document = originalDocument;
      }
      if (originalGetComputedStyle) {
        globalThis.getComputedStyle = originalGetComputedStyle;
      }
    }
  });
});
