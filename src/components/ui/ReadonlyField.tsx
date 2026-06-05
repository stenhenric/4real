import { cn } from '../../utils/cn';

interface ReadonlyFieldProps {
  id?: string | undefined;
  label: string;
  value: string;
  displayValue?: string | undefined;
  className?: string | undefined;
  multiline?: boolean | undefined;
  valueClassName?: string | undefined;
}

export function ReadonlyField({ id, label, value, displayValue, className, multiline, valueClassName }: ReadonlyFieldProps) {
  const visibleValue = displayValue ?? value;

  return (
    <div className={className}>
      <label
        className="mb-1 ml-1 block text-xs font-bold uppercase tracking-widest opacity-55"
        htmlFor={id}
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          className={cn(
            'min-h-20 w-full resize-none border-b-4 border-black/20 bg-white/60 p-3 font-mono text-sm font-bold outline-none focus:bg-white/80',
            valueClassName,
          )}
          id={id}
          readOnly
          rows={2}
          title={value}
          value={visibleValue}
        />
      ) : (
        <input
          className={cn(
            'w-full border-b-4 border-black/20 bg-white/60 p-3 font-mono text-sm font-bold outline-none focus:bg-white/80',
            valueClassName,
          )}
          id={id}
          readOnly
          title={value}
          type="text"
          value={visibleValue}
        />
      )}
    </div>
  );
}
