import { Request, Response, NextFunction } from 'express';
import fs from 'fs/promises';
import { Stats } from 'fs';
import path from 'path';

function parseMaxAge(maxAge: number | string): number {
  if (typeof maxAge === 'number') return maxAge;
  const multipliers: { [unit: string]: number } = { s: 1, m: 60, h: 3600, d: 86400 };
  const match = maxAge.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  return value * multipliers[unit];
}

function isPathInsideBaseDir(baseDir: string, targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(baseDir);
}

export default function serveStatic(
  baseDir: string,
  options?: {
    index?: boolean | string | string[];
    maxAge?: number | string;
    setHeaders?: (res: Response, filePath: string, stat: Stats) => void;
  }
) {
  const normalizedBaseDir = path.resolve(baseDir) + path.sep;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestedPath = req.path;

      if (
        !requestedPath.startsWith('/') ||
        requestedPath.includes('\0') ||
        requestedPath.includes('\\') ||
        /\.{2,}/.test(requestedPath)
      ) {
        return next();
      }

      const cleanPath = path.normalize(requestedPath);
      const filePath = path.join(normalizedBaseDir, cleanPath);

      if (!isPathInsideBaseDir(normalizedBaseDir, filePath)) {
        return next();
      }

      try {
        await fs.access(filePath, fs.constants.F_OK);
      } catch {
        return next();
      }

      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        if (options?.index === false) {
          return next();
        }
        return next();
      }

      if (options?.setHeaders) {
        options.setHeaders(res, filePath, stat);
      }

      if (options?.maxAge) {
        const maxAgeSeconds = parseMaxAge(options.maxAge);
        res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
      }

      res.sendFile(filePath, (err) => {
        if (err) {
          const error = err instanceof Error ? err : new Error('Unknown error');
          next(error);
        }
      });

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Internal server error');
      next(error);
    }
  };
}
