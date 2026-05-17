import { Copy } from 'lucide-react';
import { SketchyButton } from '../SketchyButton';
import { ReadonlyField } from './ReadonlyField';

interface CopyFieldProps {
  id?: string | undefined;
  label: string;
  value: string;
  onCopy: () => void;
  copyLabel?: string | undefined;
  valueClassName?: string | undefined;
}

export function CopyField({ id, label, value, onCopy, copyLabel = 'Copy', valueClassName }: CopyFieldProps) {
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <ReadonlyField id={id} label={label} value={value} valueClassName={valueClassName} />
        <SketchyButton className="w-full px-4 py-3 sm:w-auto" onClick={onCopy} type="button" variant="secondary">
          <Copy size={16} />
          {copyLabel}
        </SketchyButton>
      </div>
    </div>
  );
}
