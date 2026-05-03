import { cn } from '../../utils/cn';

interface GoogleAuthButtonProps {
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  text?: string;
}

export function GoogleAuthButton({
  className,
  disabled = false,
  loading = false,
  onClick,
  text = 'Continue with Google',
}: GoogleAuthButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex w-full items-center justify-center gap-3 rounded-full border border-[#747775] bg-white px-4 py-3 text-sm font-semibold text-[#1f1f1f] shadow-sm transition-colors hover:bg-[#f8fafd] disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <svg aria-hidden="true" height="18" viewBox="0 0 24 24" width="18">
        <path d="M21.35 11.1H12v2.98h5.36c-.23 1.5-1.09 2.77-2.33 3.62v3h3.77c2.21-2.03 3.48-5.03 3.48-8.59 0-.67-.06-1.32-.17-1.94Z" fill="#4285F4" />
        <path d="M12 21c2.7 0 4.96-.89 6.61-2.42l-3.77-3c-1.04.7-2.37 1.12-3.84 1.12-2.95 0-5.46-1.99-6.35-4.67H.76v3.08A9.98 9.98 0 0 0 12 21Z" fill="#34A853" />
        <path d="M5.65 12.03A5.99 5.99 0 0 1 5.29 10c0-.71.12-1.4.36-2.03V4.89H.76A9.99 9.99 0 0 0 0 10c0 1.61.38 3.14 1.06 4.49l4.59-2.46Z" fill="#FBBC05" />
        <path d="M12 3.98c1.47 0 2.78.5 3.81 1.47l2.86-2.86C16.95.98 14.69 0 12 0A9.98 9.98 0 0 0 .76 4.89l4.89 3.08C6.54 5.97 9.05 3.98 12 3.98Z" fill="#EA4335" />
      </svg>
      <span>{loading ? 'Preparing Google sign-in...' : text}</span>
    </button>
  );
}
