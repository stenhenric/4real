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

export function ensureScript(): Promise<void> {
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
      activeScript.remove();
      scriptLoadPromise = null;
      reject(error);
    }
    function onError() {
      fail(new Error('Failed to load Turnstile script'));
    }

    poll = window.setInterval(() => {
      if (window.turnstile) {
        succeed();
      }
    }, 50);

    activeScript.addEventListener('error', onError, { once: true });

    timeout = window.setTimeout(() => {
      if (!window.turnstile) {
        fail(new Error('Turnstile script timed out'));
      }
    }, 10_000);
  });

  return scriptLoadPromise;
}

export {};
