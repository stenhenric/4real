const AUTH_EMAIL_DOMAIN = '4real.app';

const normalize = (value: string) => value.trim().toLowerCase();

export function buildSyntheticEmail(username: string): string {
  return `${normalize(username)}@${AUTH_EMAIL_DOMAIN}`;
}

export function resolveAuthEmail(input: {
  email?: string;
  username?: string;
  identifier?: string;
}): string | null {
  if (input.email) {
    return normalize(input.email);
  }

  if (input.identifier?.includes('@')) {
    return normalize(input.identifier);
  }

  const username = input.username ?? input.identifier;
  if (!username) {
    return null;
  }

  return buildSyntheticEmail(username);
}
