import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface PasswordStrengthMeterProps {
  password: string;
  onValidationChange?: ((isValid: boolean) => void) | undefined;
}

export function PasswordStrengthMeter({ password, onValidationChange }: PasswordStrengthMeterProps) {
  const [strength, setStrength] = useState(0);
  
  const rules = [
    { label: 'At least 12 characters', test: (p: string) => p.length >= 12 },
    { label: 'Upper & lowercase letters', test: (p: string) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
    { label: 'Number or special character', test: (p: string) => /[0-9!@#$%^&*(),.?":{}|<>]/.test(p) },
  ];

  const results = rules.map(rule => rule.test(password));
  const passedCount = results.filter(Boolean).length;
  const isValid = passedCount === rules.length;

  useEffect(() => {
    setStrength(passedCount);
    onValidationChange?.(isValid);
  }, [passedCount, isValid, onValidationChange]);

  // If password is empty, don't show the meter heavily, just the muted rules
  if (!password) {
    return (
      <div className="mt-3 space-y-2">
        <div className="flex gap-1 h-1.5 w-full">
          {[1, 2, 3].map((_, i) => (
            <div key={i} className="h-full flex-1 rounded-full bg-black/5" />
          ))}
        </div>
        <ul className="space-y-1 mt-2">
          {rules.map((rule, idx) => (
            <li key={idx} className="flex items-center gap-2 text-xs font-medium text-black/40">
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
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className={cn('h-full flex-1 rounded-full transition-colors duration-300', getBarColor(index))}
          />
        ))}
      </div>
      
      <ul className="space-y-1 mt-2">
        {rules.map((rule, idx) => {
          const passed = results[idx];
          return (
            <li 
              key={idx} 
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
