import type { AvatarSettingsDTO } from '../../types/api';
import { cn } from '../../utils/cn';

const AVATAR_PALETTE: Record<AvatarSettingsDTO['color'], {
  fill: string;
  accent: string;
  stroke: string;
}> = {
  ink: { fill: '#f7f4ea', accent: '#111827', stroke: '#111827' },
  blue: { fill: '#dbeafe', accent: '#2563eb', stroke: '#1e3a8a' },
  teal: { fill: '#ccfbf1', accent: '#0f766e', stroke: '#134e4a' },
  yellow: { fill: '#fef3c7', accent: '#d97706', stroke: '#78350f' },
  rose: { fill: '#ffe4e6', accent: '#e11d48', stroke: '#881337' },
  violet: { fill: '#ede9fe', accent: '#7c3aed', stroke: '#4c1d95' },
};

interface ProfileAvatarProps {
  avatar: AvatarSettingsDTO;
  label: string;
  className?: string;
}

function FaceDetails({ preset, stroke, accent }: {
  preset: AvatarSettingsDTO['preset'];
  stroke: string;
  accent: string;
}) {
  switch (preset) {
    case 'pencil-face-02':
      return (
        <>
          <path d="M34 43 Q41 36 48 43" fill="none" stroke={stroke} strokeLinecap="round" strokeWidth="4" />
          <path d="M70 43 Q77 36 84 43" fill="none" stroke={stroke} strokeLinecap="round" strokeWidth="4" />
          <path d="M43 77 Q59 66 78 77" fill="none" stroke={accent} strokeLinecap="round" strokeWidth="5" />
        </>
      );
    case 'pencil-face-03':
      return (
        <>
          <circle cx="42" cy="45" fill={stroke} r="5" />
          <path d="M71 42 L83 49" stroke={stroke} strokeLinecap="round" strokeWidth="4" />
          <path d="M43 73 C51 84 70 84 80 72" fill="none" stroke={accent} strokeLinecap="round" strokeWidth="5" />
        </>
      );
    case 'pencil-face-04':
      return (
        <>
          <path d="M35 42 L49 48" stroke={stroke} strokeLinecap="round" strokeWidth="4" />
          <path d="M83 42 L69 48" stroke={stroke} strokeLinecap="round" strokeWidth="4" />
          <path d="M45 75 Q60 69 77 75" fill="none" stroke={accent} strokeLinecap="round" strokeWidth="5" />
        </>
      );
    case 'pencil-face-05':
      return (
        <>
          <circle cx="43" cy="44" fill={stroke} r="4" />
          <circle cx="78" cy="44" fill={stroke} r="4" />
          <path d="M47 73 Q60 89 76 73" fill="none" stroke={accent} strokeLinecap="round" strokeWidth="5" />
          <path d="M31 28 Q59 12 91 29" fill="none" stroke={accent} strokeLinecap="round" strokeWidth="6" />
        </>
      );
    case 'pencil-face-06':
      return (
        <>
          <path d="M36 44 Q43 50 50 44" fill="none" stroke={stroke} strokeLinecap="round" strokeWidth="4" />
          <path d="M70 44 Q77 50 84 44" fill="none" stroke={stroke} strokeLinecap="round" strokeWidth="4" />
          <path d="M45 75 L78 75" stroke={accent} strokeLinecap="round" strokeWidth="5" />
        </>
      );
    case 'pencil-face-01':
    default:
      return (
        <>
          <circle cx="42" cy="44" fill={stroke} r="5" />
          <circle cx="78" cy="44" fill={stroke} r="5" />
          <path d="M44 73 Q61 85 79 73" fill="none" stroke={accent} strokeLinecap="round" strokeWidth="5" />
        </>
      );
  }
}

export function ProfileAvatar({ avatar, label, className }: ProfileAvatarProps) {
  const colors = AVATAR_PALETTE[avatar.color] ?? AVATAR_PALETTE.ink;

  return (
    <svg
      aria-label={label}
      className={cn('block size-full', className)}
      role="img"
      viewBox="0 0 120 120"
    >
      <path
        d="M21 57 C18 31 37 17 62 18 C89 19 106 36 102 62 C99 90 79 108 52 103 C32 99 24 82 21 57 Z"
        fill={colors.fill}
        stroke={colors.stroke}
        strokeDasharray="4 5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
      <path
        d="M29 31 C42 15 73 11 91 30"
        fill="none"
        opacity="0.28"
        stroke={colors.accent}
        strokeLinecap="round"
        strokeWidth="10"
      />
      <FaceDetails accent={colors.accent} preset={avatar.preset} stroke={colors.stroke} />
      <path
        d="M58 54 Q55 62 61 64"
        fill="none"
        opacity="0.55"
        stroke={colors.stroke}
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path
        d="M22 89 C31 101 45 108 61 108"
        fill="none"
        opacity="0.35"
        stroke={colors.accent}
        strokeLinecap="round"
        strokeWidth="5"
      />
    </svg>
  );
}

export { AVATAR_PALETTE };
