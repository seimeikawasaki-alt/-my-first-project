import 'dotenv/config';
import express from 'express';
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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://careshift.jp']
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

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

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`CareShift API server running on http://localhost:${PORT}`);
});

export default app;
