import { useImperativeHandle, useRef, useEffect, useCallback, useReducer, type Ref } from 'react';
import { getTurnstileSiteKey } from './turnstile-config';
import { ensureScript } from './auth-turnstile-script';
import { SketchyButton } from '../../components/SketchyButton';
import {
  createInitialTurnstileWidgetState,
  reduceTurnstileWidgetState,
} from './turnstile-widget-state';

export interface AuthTurnstileRef {
  reset: () => void;
}

interface AuthTurnstileProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  ref?: Ref<AuthTurnstileRef>;
}

const generateSecureId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback if no crypto available at all (unlikely in modern browsers)
  return Date.now().toString(36);
};

export function AuthTurnstile({ onSuccess, onError, onExpire, ref }: AuthTurnstileProps) {
    const siteKey = getTurnstileSiteKey();
    const [widgetState, dispatchWidgetState] = useReducer(
      reduceTurnstileWidgetState,
      undefined,
      createInitialTurnstileWidgetState,
    );

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

      try {
        widgetIdRef.current = window.turnstile.render(el, {
          sitekey: siteKey,
          theme: 'light',
          size: 'normal',
          'refresh-expired': 'auto',
          callback: (token: string) => {
            dispatchWidgetState({ type: 'success' });
            onSuccessRef.current(token);
          },
          'error-callback': () => {
            dispatchWidgetState({ type: 'widget_failed' });
            onErrorRef.current?.();
          },
          'expired-callback': () => {
            dispatchWidgetState({ type: 'expired' });
            onExpireRef.current?.();
            // If refresh-expired is set to 'auto', turnstile will automatically refresh,
            // but we still want to inform the parent that the old token expired.
            // The parent will set it to undefined, and then 'callback' will be fired when the new token is generated.
          },
        });
      } catch (err) {
        console.error('[AuthTurnstile]', err);
        dispatchWidgetState({ type: 'widget_failed' });
        onErrorRef.current?.();
      }
    }, [siteKey]);

    const handleRetry = useCallback(() => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore — widget may already be gone
        }
      }
      widgetIdRef.current = null;
      dispatchWidgetState({ type: 'retry' });
    }, []);

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
          dispatchWidgetState({ type: 'script_failed' });
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
    }, [siteKey, renderWidget, widgetState.retryNonce]);

    if (!siteKey) {
      return (
        <div className="my-4 border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700">
          <strong>Configuration Error:</strong> Bot verification is not configured (missing <code>VITE_TURNSTILE_SITE_KEY</code>).
        </div>
      );
    }

    return (
      // Outer wrapper always present so layout doesn't shift once the iframe loads.
      <div className="my-2 flex min-h-[70px] flex-col items-center justify-center gap-3">
        <div key={widgetState.retryNonce} id={containerIdRef.current} />
        {widgetState.errorMessage ? (
          <div className="w-full border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700" role="alert">
            <p>{widgetState.errorMessage}</p>
            <SketchyButton
              className="mt-2"
              onClick={handleRetry}
              size="compact"
              type="button"
            >
              Retry verification
            </SketchyButton>
          </div>
        ) : null}
      </div>
    );
}
