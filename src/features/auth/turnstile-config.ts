export function getTurnstileSiteKey(): string | undefined {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? import.meta.env.TURNSTILE_SITE_KEY;
  const trimmed = key?.trim();
  return trimmed ? trimmed : undefined;
}
