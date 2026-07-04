import apiClient from './client';
import type { Attendance, AttendanceSummary, ApiResponse } from '../types';

export async function punchIn() {
  const res = await apiClient.post<ApiResponse<Attendance>>('/attendance/punch-in');
  return res.data;
}

export async function punchOut() {
  const res = await apiClient.post<ApiResponse<Attendance>>('/attendance/punch-out');
  return res.data;
}

export async function breakStart() {
  const res = await apiClient.post<ApiResponse<Attendance>>('/attendance/break-start');
  return res.data;
}

export async function breakEnd() {
  const res = await apiClient.post<ApiResponse<Attendance>>('/attendance/break-end');
  return res.data;
}

export async function getAttendances(params: { year: number; month: number; userId?: string }) {
  const res = await apiClient.get<ApiResponse<Attendance[]>>('/attendance', { params });
  return res.data;
}

export async function getMyAttendances(params: { year: number; month: number }) {
  const res = await apiClient.get<ApiResponse<Attendance[]>>('/attendance/my', { params });
  return res.data;
}

export async function createAttendance(data: {
  userId: string;
  workDate: string;
  shiftTypeId?: string | null;
  punchIn?: string | null;
  punchOut?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  status?: string;
  isHolidayWork?: boolean;
  notes?: string | null;
}) {
  const res = await apiClient.post<ApiResponse<Attendance>>('/attendance', data);
  return res.data;
}

export async function correctAttendance(id: string, data: {
  shiftTypeId?: string | null;
  punchIn?: string;
  punchOut?: string;
  breakStart?: string | null;
  breakEnd?: string | null;
  status?: string;
  isHolidayWork?: boolean;
  notes?: string | null;
  modifyReason: string;
}) {
  const res = await apiClient.put<ApiResponse<Attendance>>(`/attendance/${id}`, data);
  return res.data;
}

export async function getAttendanceSummary(params: { year: number; month: number }) {
  const res = await apiClient.get<ApiResponse<AttendanceSummary[]>>('/attendance/summary', { params });
  return res.data;
}

export function exportAttendanceCsvUrl(year: number, month: number) {
  const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  return `${base}/attendance/export?year=${year}&month=${month}`;
}
