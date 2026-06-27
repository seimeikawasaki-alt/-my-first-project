import apiClient from './client';
import type { Shift, ApiResponse } from '../types';

export async function getShifts(params: { year: number; month: number; groupId?: string }) {
  const res = await apiClient.get<ApiResponse<Shift[]>>('/shifts', { params });
  return res.data;
}

export async function getMyShifts(params: { year: number; month: number }) {
  const res = await apiClient.get<ApiResponse<Shift[]>>('/shifts/my', { params });
  return res.data;
}

export async function createShift(data: {
  userId: string;
  shiftTypeId?: string | null;
  shiftDate: string;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
}) {
  const res = await apiClient.post<ApiResponse<Shift>>('/shifts', data);
  return res.data;
}

export async function updateShift(id: string, data: {
  shiftTypeId?: string | null;
  shiftDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
}) {
  const res = await apiClient.put<ApiResponse<Shift>>(`/shifts/${id}`, data);
  return res.data;
}

export async function deleteShift(id: string) {
  const res = await apiClient.delete<ApiResponse<{ message: string }>>(`/shifts/${id}`);
  return res.data;
}

export async function publishShifts(data: { year: number; month: number; groupId?: string }) {
  const res = await apiClient.post<ApiResponse<{ publishedCount: number }>>('/shifts/publish', data);
  return res.data;
}

export async function bulkCopyShifts(data: { year: number; month: number; groupId?: string }) {
  const res = await apiClient.post<ApiResponse<{ copiedCount: number }>>('/shifts/bulk', data);
  return res.data;
}
