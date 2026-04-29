import { sanitizeUrlPath } from './redact.ts';

export function getLoggedPath(req: { path?: string; originalUrl?: string }): string | undefined {
  if (typeof req.path === 'string' && req.path.length > 0) {
    return sanitizeUrlPath(req.path);
  }

  if (typeof req.originalUrl === 'string') {
    return sanitizeUrlPath(req.originalUrl);
  }

  return undefined;
}
