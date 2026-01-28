import { NextFunction, Request, Response } from 'express';
import fs, { Stats } from 'fs';
import path from 'path';

interface ServeStaticOptions {
  index?: boolean;
  maxAge?: string | number;
  setHeaders?: (res: Response, filePath: string, stats: Stats) => void;
}

function parseMaxAge(maxAge: string): number {
  const units: { [key: string]: number } = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  const num = parseInt(maxAge, 10);
  const unit = maxAge.slice(-1);

  if (units[unit]) {
    return num * units[unit];
  }

  return num;
}

export default function serveStatic(
  baseDir: string,
  options: ServeStaticOptions = {}
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const filePath = path.join(baseDir, req.path);

    fs.access(filePath, fs.constants.F_OK, (accessErr) => {
      if (accessErr) {
        return next();
      }

      fs.stat(filePath, (statErr, stats) => {
        if (statErr) {
          return next(statErr);
        }

        if (options.setHeaders) {
          options.setHeaders(res, filePath, stats);
        }

        if (options.maxAge) {
          const maxAge =
            typeof options.maxAge === 'string'
              ? parseMaxAge(options.maxAge)
              : options.maxAge;
          res.setHeader('Cache-Control', `max-age=${maxAge}`);
        }

        res.sendFile(filePath, (sendErr) => {
          if (sendErr) {
            next(sendErr);
          }
        });
      });
    });
  };
}
