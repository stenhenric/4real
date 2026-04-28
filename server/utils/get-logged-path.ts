export function getLoggedPath(req: { path?: string; originalUrl?: string }): string | undefined {
  if (typeof req.path === 'string' && req.path.length > 0) {
    return req.path;
  }

  if (typeof req.originalUrl === 'string') {
    return req.originalUrl.split('?')[0];
  }

  return undefined;
}
