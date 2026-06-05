import { Copy } from 'lucide-react';
import { SketchyButton } from '../SketchyButton';
import { ReadonlyField } from './ReadonlyField';

interface CopyFieldProps {
  id?: string | undefined;
  label: string;
  value: string;
  displayValue?: string | undefined;
  onCopy: () => void;
  copyLabel?: string | undefined;
  multilineValue?: boolean | undefined;
  valueClassName?: string | undefined;
}

export function CopyField({
  id,
  label,
  value,
  displayValue,
  onCopy,
  copyLabel = 'Copy',
  multilineValue,
  valueClassName,
}: CopyFieldProps) {
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <ReadonlyField
          id={id}
          label={label}
          value={value}
          displayValue={displayValue}
          multiline={multilineValue}
          valueClassName={valueClassName}
        />
        <SketchyButton className="w-full px-4 py-3 sm:w-auto" onClick={onCopy} type="button" variant="secondary">
          <Copy size={16} />
          {copyLabel}
        </SketchyButton>
      </div>
    </div>
  );
}
