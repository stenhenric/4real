export function resolveCanvasColor(value: string | undefined, fallback: string): string {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return fallback;
  }

  if (!trimmedValue.startsWith('var(') || !trimmedValue.endsWith(')')) {
    return trimmedValue;
  }

  const [tokenName = '', tokenFallback] = trimmedValue
    .slice(4, -1)
    .split(',', 2)
    .map((part) => part.trim());

  if (
    typeof document === 'undefined'
    || typeof getComputedStyle !== 'function'
    || !document.documentElement
  ) {
    return tokenFallback ? resolveCanvasColor(tokenFallback, fallback) : fallback;
  }

  const resolvedValue = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
  if (resolvedValue) {
    return resolvedValue;
  }

  return tokenFallback ? resolveCanvasColor(tokenFallback, fallback) : fallback;
}
