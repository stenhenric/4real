import { cn } from '../../utils/cn';

interface ReadonlyFieldProps {
  id?: string | undefined;
  label: string;
  value: string;
  className?: string | undefined;
  valueClassName?: string | undefined;
}

export function ReadonlyField({ id, label, value, className, valueClassName }: ReadonlyFieldProps) {
  return (
    <div className={className}>
      <label
        className="mb-1 ml-1 block text-xs font-bold uppercase tracking-widest opacity-55"
        htmlFor={id}
      >
        {label}
      </label>
      <input
        className={cn(
          'w-full border-b-4 border-black/20 bg-white/60 p-3 font-mono text-sm font-bold outline-none focus:bg-white/80',
          valueClassName,
        )}
        id={id}
        readOnly
        type="text"
        value={value}
      />
    </div>
  );
}
