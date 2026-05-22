import type { NextFunction, Request, Response } from 'express';

export function applyNoStoreHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export function applyPublicCacheHeaders(res: Response, maxAgeSeconds: number): void {
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}, must-revalidate`);
  res.vary('Accept-Encoding');
}

export function applyPublicSharedCacheHeaders(
  res: Response,
  maxAgeSeconds: number,
  options: {
    staleWhileRevalidateSeconds?: number;
    staleIfErrorSeconds?: number;
  } = {},
): void {
  const directives = [
    'public',
    `max-age=${maxAgeSeconds}`,
    `s-maxage=${maxAgeSeconds}`,
  ];

  if (options.staleWhileRevalidateSeconds !== undefined) {
    directives.push(`stale-while-revalidate=${options.staleWhileRevalidateSeconds}`);
  }

  if (options.staleIfErrorSeconds !== undefined) {
    directives.push(`stale-if-error=${options.staleIfErrorSeconds}`);
  }

  res.setHeader('Cache-Control', directives.join(', '));
  res.vary('Accept-Encoding');
}

export function applyImmutableAssetCacheHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.vary('Accept-Encoding');
}

export function applyClearSiteDataHeaders(res: Response): void {
  res.setHeader('Clear-Site-Data', '"cache", "storage"');
}

export function apiNoStoreMiddleware(_req: Request, res: Response, next: NextFunction): void {
  applyNoStoreHeaders(res);
  next();
}
