import apiClient from './client';
import type { ShiftRequest, ShiftRequestStatus, ShiftRequestType, ApiResponse } from '../types';

export async function getShiftRequests(params?: { status?: ShiftRequestStatus }) {
  const res = await apiClient.get<ApiResponse<ShiftRequest[]>>('/shift-requests', { params });
  return res.data;
}

export async function getMyShiftRequests() {
  const res = await apiClient.get<ApiResponse<ShiftRequest[]>>('/shift-requests/my');
  return res.data;
}

export async function createShiftRequest(data: {
  requestType: ShiftRequestType;
  targetDate?: string | null;
  shiftTypeId?: string | null;
  reason?: string | null;
  priority?: number;
}) {
  const res = await apiClient.post<ApiResponse<ShiftRequest>>('/shift-requests', data);
  return res.data;
}

export async function deleteShiftRequest(id: string) {
  const res = await apiClient.delete<ApiResponse<{ message: string }>>(`/shift-requests/${id}`);
  return res.data;
}

export async function reviewShiftRequest(id: string, data: { status: 'APPROVED' | 'REJECTED' }) {
  const res = await apiClient.put<ApiResponse<ShiftRequest>>(`/shift-requests/${id}`, data);
  return res.data;
}
