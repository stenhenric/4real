import { Turnstile } from '@marsidev/react-turnstile';

interface AuthTurnstileProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
}

export function AuthTurnstile({ onSuccess, onError }: AuthTurnstileProps) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return null;
  }

  return (
    <div className="flex justify-center my-4">
      <Turnstile
        siteKey={siteKey}
        onSuccess={onSuccess}
        onError={onError}
        options={{
          theme: 'light',
        }}
      />
    </div>
  );
}
