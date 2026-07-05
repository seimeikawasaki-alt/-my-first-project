import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';

import authRouter from './routes/auth.js';
import staffRouter from './routes/staff.js';
import groupsRouter from './routes/groups.js';
import shiftTypesRouter from './routes/shiftTypes.js';
import shiftsRouter from './routes/shifts.js';
import attendanceRouter from './routes/attendance.js';
import shiftRequestsRouter from './routes/shiftRequests.js';
import shiftRulesRouter from './routes/shiftRules.js';
import shiftRequirementsRouter from './routes/shiftRequirements.js';
import staffConstraintsRouter from './routes/staffConstraints.js';
import staffShiftStatsRouter from './routes/staffShiftStats.js';
import salaryRouter from './routes/salary.js';
import payrollRouter from './routes/payroll.js';
import dashboardRouter from './routes/dashboard.js';
import paidLeaveRouter from './routes/paidLeave.js';
import overtimeRouter from './routes/overtime.js';
import shiftSwapRouter from './routes/shiftSwap.js';
import auditLogsRouter from './routes/auditLogs.js';
import { authLimiter, generalLimiter } from './middleware/rateLimit.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Rate limiting: stricter on login, general cap on the rest of the API
app.use('/api/v1', generalLimiter);
app.use('/api/v1/auth/login', authLimiter);

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/staff', staffRouter);
app.use('/api/v1/groups', groupsRouter);
app.use('/api/v1/shift-types', shiftTypesRouter);
app.use('/api/v1/shifts', shiftsRouter);
app.use('/api/v1/attendance', attendanceRouter);
app.use('/api/v1/shift-requests', shiftRequestsRouter);
app.use('/api/v1/shift-rules', shiftRulesRouter);
app.use('/api/v1/shift-requirements', shiftRequirementsRouter);
app.use('/api/v1/staff-constraints', staffConstraintsRouter);
app.use('/api/v1/staff-shift-stats', staffShiftStatsRouter);
app.use('/api/v1/salary', salaryRouter);
app.use('/api/v1/payroll', payrollRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/paid-leave', paidLeaveRouter);
app.use('/api/v1/overtime', overtimeRouter);
app.use('/api/v1/shift-swap', shiftSwapRouter);
app.use('/api/v1/audit-logs', auditLogsRouter);

const APP_VERSION = '1.0.0';
const healthPayload = () => ({ status: 'ok', version: APP_VERSION, timestamp: new Date().toISOString() });

// Health checks for deployment liveness probes
app.get('/api/health', (_req, res) => { res.json(healthPayload()); });
app.get('/api/v1/health', (_req, res) => { res.json(healthPayload()); });

// Central error handler: turn a thrown/passed error into a 500 response
// instead of leaving the request hanging. The 4-arg signature (incl. `next`)
// is what makes Express treat this as an error handler.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API error]', err);
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'サーバー内部エラーが発生しました' },
    });
  }
});

// Safety net: a failing request (e.g. a DB error) must never take the whole
// server down — that would knock every screen offline, not just the one that
// errored. Log and keep serving.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

app.listen(PORT, () => {
  console.log(`CareShift API server running on http://localhost:${PORT}`);
});

export default app;
