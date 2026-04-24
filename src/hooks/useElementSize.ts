import { useEffect, useRef, useState } from 'react';

interface ElementSize {
  width: number;
  height: number;
}

const INITIAL_SIZE: ElementSize = { width: 0, height: 0 };

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

      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return { elementRef, size };
}
