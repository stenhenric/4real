import type { NextFunction, Request, Response } from 'express';

export function applyNoStoreHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

export function applyPublicCacheHeaders(res: Response, maxAgeSeconds: number): void {
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}, must-revalidate`);
}

export function applyImmutableAssetCacheHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
}

export function applyClearSiteDataHeaders(res: Response): void {
  res.setHeader('Clear-Site-Data', '"cache", "cookies", "storage"');
}

export function apiNoStoreMiddleware(_req: Request, res: Response, next: NextFunction): void {
  applyNoStoreHeaders(res);
  next();
}
