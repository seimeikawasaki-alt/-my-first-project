import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap an async route handler so a thrown/rejected error is forwarded to
 * Express's error middleware (→ 500 response) instead of becoming an
 * unhandled rejection that leaves the request hanging forever.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
