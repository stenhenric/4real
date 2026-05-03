import { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react';

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
    turnstile: any;
  }
}

export const AuthTurnstile = forwardRef<AuthTurnstileRef, AuthTurnstileProps>(
  ({ onSuccess, onError, onExpire }, ref) => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [isScriptLoaded, setIsScriptLoaded] = useState(!!window.turnstile);
    const [scriptError, setScriptError] = useState(false);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (window.turnstile && widgetIdRef.current) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }));

    useEffect(() => {
      if (!siteKey || window.turnstile) {
        if (window.turnstile) {
            setIsScriptLoaded(true);
        }
        return;
      }

      const scriptId = 'cloudflare-turnstile-script';
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;

      let createdScript = false;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
        createdScript = true;
      }

      const handleLoad = () => {
        setIsScriptLoaded(true);
        setScriptError(false);
      };

      const handleError = () => {
        setIsScriptLoaded(false);
        setScriptError(true);
      };

      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);

      return () => {
        if (script) {
          script.removeEventListener('load', handleLoad);
          script.removeEventListener('error', handleError);
        }
      };
    }, [siteKey]);

    useEffect(() => {
      if (!siteKey || !isScriptLoaded || !window.turnstile || !containerRef.current || scriptError) return;

      try {
        if (!widgetIdRef.current) {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: onSuccess,
            'error-callback': onError,
            'expired-callback': onExpire,
            theme: 'light',
            'refresh-expired': 'auto',
          });
        }
      } catch (error) {
        console.error('Failed to render Turnstile:', error);
      }

      return () => {
        if (widgetIdRef.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
            widgetIdRef.current = null;
          } catch (error) {
            console.error('Failed to remove Turnstile widget:', error);
          }
        }
      };
    }, [isScriptLoaded, scriptError, siteKey, onSuccess, onError, onExpire]);

    if (!siteKey) {
      console.error('[AuthTurnstile] VITE_TURNSTILE_SITE_KEY is missing. TURNSTILE_REQUIRED bot verification will fail.');
      return (
        <div className="my-4 rounded-md border border-red-500 bg-red-50 p-4 text-sm text-red-700 text-center">
          <strong>Configuration Error:</strong> Bot verification is required but not configured.
        </div>
      );
    }

    if (scriptError) {
      return (
        <div className="my-4 rounded-md border border-red-500 bg-red-50 p-4 text-sm text-red-700 text-center">
          <strong>Network Error:</strong> Failed to load bot verification script. Please refresh the page.
        </div>
      );
    }

    return (
      <div className="flex justify-center my-4">
        <div ref={containerRef}></div>
      </div>
    );
  }
);

AuthTurnstile.displayName = 'AuthTurnstile';
