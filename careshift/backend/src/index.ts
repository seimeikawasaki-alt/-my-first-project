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

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`CareShift API server running on http://localhost:${PORT}`);
});

export default app;
