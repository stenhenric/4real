import { Check, X } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface PasswordStrengthMeterProps {
  password: string;
}

export const PASSWORD_RULES = [
  { label: '12 to 128 characters', test: (p: string) => p.length >= 12 && p.length <= 128 },
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
    if (passedCount === 2) return 'bg-warning-border';
    return 'bg-success-border';
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
                passed ? "text-success-text" : "text-black/50"
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
