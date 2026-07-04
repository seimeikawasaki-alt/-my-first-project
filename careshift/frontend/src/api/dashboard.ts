import apiClient from './client';
import type { ApiResponse } from '../types';

export interface DashboardStaff {
  userId: string;
  userCode: string;
  name: string;
  onBreak?: boolean;
  punchIn?: string | null;
}

export interface RecentRequest {
  id: string;
  name: string;
  requestType: string;
  targetDate: string | null;
}

export interface TodayDashboard {
  working: DashboardStaff[];
  workingCount: number;
  nightWorkingCount: number;
  absent: DashboardStaff[];
  notPunchedOut: DashboardStaff[];
  scheduledCount: number;
  pendingRequests: number;
  payrollUnconfirmed: number;
  recentRequests: RecentRequest[];
}

export interface TodayShift {
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  color?: string | null;
  isNightShift: boolean;
}

export interface MyDashboard {
  todayShift: TodayShift | null;
  monthSummary: { workDays: number; nightCount: number; offDays: number };
  missingPunchOut: { date: string } | null;
  notices: { text: string }[];
}

export async function getTodayDashboard() {
  const res = await apiClient.get<ApiResponse<TodayDashboard>>('/dashboard/today');
  return res.data;
}

export async function getMyDashboard() {
  const res = await apiClient.get<ApiResponse<MyDashboard>>('/dashboard/me');
  return res.data;
}
