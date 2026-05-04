import { type ComponentProps, forwardRef, useId } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../../../utils/cn';

export interface AuthInputProps extends Omit<ComponentProps<'input'>, 'className'> {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  success?: boolean;
  containerClassName?: string;
  inputClassName?: string;
  endAdornment?: React.ReactNode;
}

export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ label, hint, error, success, id, containerClassName, inputClassName, endAdornment, ...props }, ref) => {
    const defaultId = useId();
    const fieldId = id ?? defaultId;

    return (
      <div className={cn('relative', containerClassName)}>
        <label className="block mb-1.5" htmlFor={fieldId}>
          <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-black/50">
            {label}
          </span>
        </label>
        <div className="relative">
          <input
            {...props}
            id={fieldId}
            ref={ref}
            className={cn(
              'w-full rounded-[20px] border-2 bg-white/90 px-4 py-3 text-base font-medium text-black shadow-[inset_0_1px_3px_rgba(0,0,0,0.05)] transition-colors placeholder:text-black/30 focus:outline-none focus:border-ink-blue focus:bg-white',
              error
                ? 'border-ink-red/60 focus:border-ink-red bg-red-50/30'
                : success
                ? 'border-green-600/60 focus:border-green-600 bg-green-50/30'
                : 'border-black/10 hover:border-black/20',
              inputClassName,
            )}
          />
          {error && !endAdornment && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-red opacity-80 pointer-events-none">
              <AlertCircle size={20} />
            </div>
          )}
          {success && !error && !endAdornment && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 opacity-80 pointer-events-none">
              <CheckCircle2 size={20} />
            </div>
          )}
          {endAdornment && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
              {endAdornment}
            </div>
          )}
        </div>
        
        {/* Real-time feedback container */}
        <div className="min-h-[20px] mt-1.5">
          {error ? (
            <p className="text-sm font-semibold text-ink-red flex items-center gap-1.5 animate-in slide-in-from-top-1 fade-in duration-200">
              {error}
            </p>
          ) : hint ? (
            <p className="text-sm text-black/50 italic">{hint}</p>
          ) : null}
        </div>
      </div>
    );
  }
);

AuthInput.displayName = 'AuthInput';
