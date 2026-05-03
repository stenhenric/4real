import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

export interface AuthTurnstileRef {
  reset: () => void;
}

interface AuthTurnstileProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
}

export const AuthTurnstile = forwardRef<AuthTurnstileRef, AuthTurnstileProps>(
  ({ onSuccess, onError, onExpire }, ref) => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    const turnstileRef = useRef<TurnstileInstance>(null);

    useImperativeHandle(ref, () => ({
      reset: () => {
        turnstileRef.current?.reset();
      },
    }));

    if (!siteKey) {
      return null;
    }

    return (
      <div className="flex justify-center my-4">
        <Turnstile
          ref={turnstileRef}
          siteKey={siteKey}
          onSuccess={onSuccess}
          onError={onError}
          onExpire={onExpire}
          options={{
            theme: 'light',
            refreshExpired: 'auto',
          }}
        />
      </div>
    );
  }
);

AuthTurnstile.displayName = 'AuthTurnstile';
