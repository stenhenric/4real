import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { AuthInput, type AuthInputProps } from './AuthInput';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

export interface PasswordInputProps extends AuthInputProps {
  showStrengthMeter?: boolean;
  onValidationChange?: (isValid: boolean) => void;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ showStrengthMeter, onValidationChange, value, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);

    const toggleShowPassword = () => setShowPassword(!showPassword);

    return (
      <div className="w-full">
        <AuthInput
          {...props}
          ref={ref}
          type={showPassword ? 'text' : 'password'}
          value={value}
          endAdornment={
            <button
              type="button"
              onClick={toggleShowPassword}
              className="p-1 text-black/40 hover:text-ink-blue transition-colors rounded-full focus-visible:outline-2 focus-visible:outline-ink-blue"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          }
        />
        {showStrengthMeter && (
          <PasswordStrengthMeter 
            password={value as string ?? ''} 
            onValidationChange={onValidationChange} 
          />
        )}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
