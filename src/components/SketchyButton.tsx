import type * as React from 'react';
import { useState } from 'react';
import { cn } from '../utils/cn';

type SketchyButtonProps = React.ComponentProps<'button'> & {
  fill?: string;
  stroke?: string;
  activeColor?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'default' | 'compact' | 'icon';
};

const VARIANT_COLORS: Record<NonNullable<SketchyButtonProps['variant']>, {
  fill: string;
  activeColor: string;
  stroke: string;
}> = {
  primary: {
    fill: 'var(--color-note-yellow)',
    activeColor: 'var(--color-note-yellow)',
    stroke: 'var(--color-ink-black)',
  },
  secondary: {
    fill: '#ffffff',
    activeColor: 'var(--color-paper-soft)',
    stroke: 'var(--color-ink-black)',
  },
  danger: {
    fill: 'var(--color-danger-bg)',
    activeColor: 'var(--color-danger-bg)',
    stroke: 'var(--color-ink-red)',
  },
  ghost: {
    fill: 'transparent',
    activeColor: 'rgba(26, 26, 26, 0.06)',
    stroke: 'var(--color-ink-black)',
  },
};

function resolveCssColor(value: string, fallback: string) {
  if (typeof document === 'undefined' || !value.startsWith('var(')) {
    return value;
  }

  const tokenName = value.slice(4, -1).trim();
  return getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim() || fallback;
}

export const SketchyButton = ({ 
  children, 
  className,
  fill,
  stroke,
  activeColor,
  variant = 'ghost',
  size: buttonSize = 'default',
  style,
  onMouseEnter,
  onMouseLeave,
  type = 'button',
  ...props 
}: SketchyButtonProps) => {
  const [hovered, setHovered] = useState(false);
  const variantColors = VARIANT_COLORS[variant];
  const resolvedFill = fill ?? variantColors.fill;
  const resolvedStroke = stroke ?? variantColors.stroke;
  const resolvedActiveColor = activeColor ?? variantColors.activeColor;
  const currentFill = hovered ? resolvedActiveColor : resolvedFill;
  const resolvedBorderColor = resolveCssColor(resolvedStroke, '#1a1a1a');

  return (
    <button
      onMouseEnter={(event) => {
        if (!props.disabled) setHovered(true);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setHovered(false);
        onMouseLeave?.(event);
      }}
      className={cn(
        "sketchy-border relative inline-flex min-w-0 items-center justify-center font-bold shadow-sm transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-blue disabled:opacity-50 disabled:cursor-not-allowed",
        buttonSize === 'default' && 'px-6 py-2',
        buttonSize === 'compact' && 'px-3 py-1 text-sm',
        buttonSize === 'icon' && 'aspect-square p-2',
        className
      )}
      style={{
        borderColor: resolvedBorderColor,
        ...(currentFill !== 'transparent'
          ? { backgroundColor: currentFill }
          : {}),
        ...style,
      }}
      type={type}
      {...props}
    >
      <span className="relative z-10 flex min-w-0 items-center justify-center gap-2">{children}</span>
    </button>
  );
};
