import { type ComponentProps, forwardRef, useId } from 'react';
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
        <label className="block" htmlFor={fieldId}>
          <span className="font-mono font-bold text-[10px] uppercase tracking-widest opacity-50">
            {label}
          </span>
        </label>

        <div className="relative mt-2">
          <input
            {...props}
            id={fieldId}
            ref={ref}
            className={cn(
              'w-full bg-transparent border-b-4 border-black font-bold text-lg outline-none p-2 focus:bg-white/50 transition-colors placeholder:opacity-30',
              error   && 'border-ink-red',
              success && !error && 'border-green-700',
              props.disabled && 'opacity-40 cursor-not-allowed',
              inputClassName,
            )}
          />
          {endAdornment && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
              {endAdornment}
            </div>
          )}
        </div>

        <div className="min-h-[18px] mt-1">
          {error ? (
            <p className="text-xs font-bold text-ink-red">{error}</p>
          ) : hint ? (
            <p className="text-xs font-bold opacity-40 italic">{hint}</p>
          ) : null}
        </div>
      </div>
    );
  }
);

AuthInput.displayName = 'AuthInput';
