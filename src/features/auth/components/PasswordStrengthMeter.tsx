import { Check, X } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface PasswordStrengthMeterProps {
  password: string;
}

export const PASSWORD_RULES = [
  { label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
  { label: 'Upper & lowercase letters', test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'Number or special character', test: (p: string) => /[0-9!@#$%^&*(),.?":{}|<>]/.test(p) },
] as const;

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const results = PASSWORD_RULES.map(rule => rule.test(password));
  const passedCount = results.filter(Boolean).length;

  // If password is empty, don't show the meter heavily, just the muted rules
  if (!password) {
    return (
      <div className="mt-3 space-y-2">
        <div className="flex gap-1 h-1.5 w-full">
          {PASSWORD_RULES.map((rule) => (
            <div key={rule.label} className="h-full flex-1 bg-black/5" />
          ))}
        </div>
        <ul className="space-y-1 mt-2">
          {PASSWORD_RULES.map((rule) => (
            <li key={rule.label} className="flex items-center gap-2 text-xs font-medium text-black/40">
              <div className="w-3" />
              {rule.label}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const getBarColor = (index: number) => {
    if (index >= passedCount) return 'bg-black/5';
    if (passedCount === 1) return 'bg-ink-red/70';
    if (passedCount === 2) return 'bg-yellow-500/80';
    return 'bg-green-600/80';
  };

  return (
    <div className="mt-3 space-y-2 animate-in fade-in duration-300">
      <div className="flex gap-1 h-1.5 w-full">
        {PASSWORD_RULES.map((rule, index) => (
          <div
            key={rule.label}
            className={cn('h-full flex-1 transition-colors duration-300', getBarColor(index))}
          />
        ))}
      </div>
      
      <ul className="space-y-1 mt-2">
        {PASSWORD_RULES.map((rule, idx) => {
          const passed = results[idx];
          return (
            <li
              key={rule.label}
              className={cn(
                "flex items-center gap-2 text-xs font-bold transition-colors duration-200",
                passed ? "text-green-700" : "text-black/50"
              )}
            >
              {passed ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} className="opacity-50" />}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
