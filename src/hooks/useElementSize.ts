import { useEffect, useRef, useState } from 'react';

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
  const elementRef = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>(INITIAL_SIZE);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const nextSize = getBorderBoxSize(element, entry);
      setSize((currentSize) => {
        if (currentSize.width === nextSize.width && currentSize.height === nextSize.height) {
          return currentSize;
        }

        return nextSize;
      });
    });

    setSize(getBorderBoxSize(element));
    resizeObserver.observe(element, { box: 'border-box' });

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return { elementRef, size };
}
