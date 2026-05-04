import { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';

export interface AuthTurnstileRef {
  reset: () => void;
}

interface AuthTurnstileProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
}

declare global {
  interface Window {
    turnstile: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_ID = 'cf-turnstile-script';

function ensureScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    // Script already in DOM but turnstile not ready yet — poll for it
    const poll = setInterval(() => {
      if (window.turnstile) {
        clearInterval(poll);
        resolve();
      }
    }, 50);

    script.addEventListener('error', () => {
      clearInterval(poll);
      reject(new Error('Failed to load Turnstile script'));
    }, { once: true });

    // Hard timeout safety valve
    setTimeout(() => {
      clearInterval(poll);
      if (!window.turnstile) reject(new Error('Turnstile script timed out'));
    }, 10_000);
  });
}

export const AuthTurnstile = forwardRef<AuthTurnstileRef, AuthTurnstileProps>(
  ({ onSuccess, onError, onExpire }, ref) => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);

    // Stable callback refs — changing the JS callbacks won't cause the widget
    // to be torn down and re-rendered on every parent re-render.
    const onSuccessRef = useRef(onSuccess);
    const onErrorRef = useRef(onError);
    const onExpireRef = useRef(onExpire);
    useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
    useEffect(() => { onErrorRef.current = onError; }, [onError]);
    useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }));

    const renderWidget = useCallback(() => {
      if (!containerRef.current || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'light',
        size: 'normal',
        'refresh-expired': 'auto',
        callback: (token: string) => onSuccessRef.current(token),
        'error-callback': () => onErrorRef.current?.(),
        'expired-callback': () => onExpireRef.current?.(),
      });
    }, [siteKey]);

    useEffect(() => {
      if (!siteKey) return;

      let cancelled = false;

      ensureScript()
        .then(() => {
          if (!cancelled) renderWidget();
        })
        .catch((err: unknown) => {
          console.error('[AuthTurnstile]', err);
          onErrorRef.current?.();
        });

      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {
            // ignore — widget may already be gone
          }
          widgetIdRef.current = null;
        }
      };
    }, [siteKey, renderWidget]);

    if (!siteKey) {
      return (
        <div className="my-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700">
          <strong>Configuration Error:</strong> Bot verification is not configured (missing <code>VITE_TURNSTILE_SITE_KEY</code>).
        </div>
      );
    }

    return (
      // Outer wrapper always present so layout doesn't shift once the iframe loads.
      <div className="my-2 flex min-h-[70px] items-center justify-center">
        <div ref={containerRef} />
      </div>
    );
  },
);

AuthTurnstile.displayName = 'AuthTurnstile';
