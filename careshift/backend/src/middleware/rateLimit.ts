import { rateLimit } from 'express-rate-limit';
import { Request, Response } from 'express';

// Shared 429 response in the app's standard error shape.
function tooMany(res: Response, message: string): void {
  res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message },
  });
}

/** Login: 10 attempts per 15 minutes per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req: Request, res: Response) =>
    tooMany(res, 'ログイン試行が多すぎます。しばらく待ってから再試行してください'),
});

/** General API: 100 requests per minute per IP. */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req: Request, res: Response) =>
    tooMany(res, 'リクエストが多すぎます。しばらく待ってから再試行してください'),
});

/** PDF generation: 5 per minute per IP. */
export const pdfLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req: Request, res: Response) =>
    tooMany(res, 'PDF生成の回数が多すぎます。しばらく待ってから再試行してください'),
});
