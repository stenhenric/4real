import { useCallback, useRef, useState } from 'react';

interface ElementSize {
  width: number;
  height: number;
}

const INITIAL_SIZE: ElementSize = { width: 0, height: 0 };

function getBorderBoxSize(element: HTMLElement, entry?: ResizeObserverEntry): ElementSize {
  const borderBoxSize = entry?.borderBoxSize;
  const boxSize = Array.isArray(borderBoxSize) ? borderBoxSize[0] : borderBoxSize;

  if (boxSize) {
    return {
      width: boxSize.inlineSize,
      height: boxSize.blockSize,
    };
  }

  const rect = element.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
  };
}

export function useElementSize<T extends HTMLElement>() {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [size, setSize] = useState<ElementSize>(INITIAL_SIZE);

  const updateSize = useCallback((nextSize: ElementSize) => {
    setSize((currentSize) => {
      if (currentSize.width === nextSize.width && currentSize.height === nextSize.height) {
        return currentSize;
      }

      return nextSize;
    });
  }, []);

  const elementRef = useCallback((element: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;

    if (!element) {
      return;
    }

    updateSize(getBorderBoxSize(element));

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      updateSize(getBorderBoxSize(element, entry));
    });

    resizeObserver.observe(element, { box: 'border-box' });
    observerRef.current = resizeObserver;
  }, [updateSize]);

  return { elementRef, size };
}
