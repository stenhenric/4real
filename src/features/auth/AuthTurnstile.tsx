import { forwardRef, useImperativeHandle, useRef, useEffect, useCallback } from 'react';
import { getTurnstileSiteKey } from './turnstile-config';

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
let scriptLoadPromise: Promise<void> | null = null;

function ensureScript(): Promise<void> {
  if (window.turnstile) {
    return Promise.resolve();
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const activeScript = script;
    let settled = false;
    let poll: number;
    let timeout: number;
    function cleanup() {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      activeScript.removeEventListener('error', onError);
    }
    function succeed() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }
    function fail(error: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      scriptLoadPromise = null;
      reject(error);
    }
    function onError() {
      fail(new Error('Failed to load Turnstile script'));
    }

    // Script already in DOM but turnstile not ready yet — poll for it
    poll = window.setInterval(() => {
      if (window.turnstile) {
        succeed();
      }
    }, 50);

    activeScript.addEventListener('error', onError, { once: true });

    // Hard timeout safety valve
    timeout = window.setTimeout(() => {
      if (!window.turnstile) {
        fail(new Error('Turnstile script timed out'));
      }
    }, 10_000);
  });

  return scriptLoadPromise;
}

const generateSecureId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback if no crypto available at all (unlikely in modern browsers)
  return Date.now().toString(36);
};

export const AuthTurnstile = forwardRef<AuthTurnstileRef, AuthTurnstileProps>(
  ({ onSuccess, onError, onExpire }, ref) => {
    const siteKey = getTurnstileSiteKey();

    const containerIdRef = useRef(`turnstile-${generateSecureId()}`);
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
      // Ensure the element actually exists in the DOM
      const el = document.getElementById(containerIdRef.current);
      if (!el || widgetIdRef.current) return;
      
      widgetIdRef.current = window.turnstile.render(el, {
        sitekey: siteKey,
        theme: 'light',
        size: 'normal',
        'refresh-expired': 'auto',
        callback: (token: string) => onSuccessRef.current(token),
        'error-callback': () => onErrorRef.current?.(),
        'expired-callback': () => {
          onExpireRef.current?.();
          // If refresh-expired is set to 'auto', turnstile will automatically refresh,
          // but we still want to inform the parent that the old token expired.
          // The parent will set it to undefined, and then 'callback' will be fired when the new token is generated.
        },
      });
    }, [siteKey]);

    useEffect(() => {
      if (!siteKey) return;

      let cancelled = false;
      let renderTimer: number | undefined;

      ensureScript()
        .then(() => {
          if (!cancelled) {
            // Delay rendering slightly to ensure DOM is fully painted and mounted
            renderTimer = window.setTimeout(() => {
              if (!cancelled) renderWidget();
            }, 100);
          }
        })
        .catch((err: unknown) => {
          console.error('[AuthTurnstile]', err);
          onErrorRef.current?.();
        });

      return () => {
        cancelled = true;
        if (renderTimer !== undefined) {
          window.clearTimeout(renderTimer);
        }
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
          <strong>Configuration Error:</strong> Bot verification is not configured (missing <code>VITE_TURNSTILE_SITE_KEY</code> or <code>TURNSTILE_SITE_KEY</code>).
        </div>
      );
    }

    return (
      // Outer wrapper always present so layout doesn't shift once the iframe loads.
      <div className="my-2 flex min-h-[70px] items-center justify-center">
        <div id={containerIdRef.current} />
      </div>
    );
  },
);

AuthTurnstile.displayName = 'AuthTurnstile';
