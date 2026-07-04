import apiClient from './client';
import type { ApiResponse } from '../types';

export interface DashboardStaff {
  userId: string;
  userCode: string;
  name: string;
  onBreak?: boolean;
}

export interface TodayDashboard {
  working: DashboardStaff[];
  absent: DashboardStaff[];
  scheduledCount: number;
  pendingRequests: number;
}

export async function getTodayDashboard() {
  const res = await apiClient.get<ApiResponse<TodayDashboard>>('/dashboard/today');
  return res.data;
}
