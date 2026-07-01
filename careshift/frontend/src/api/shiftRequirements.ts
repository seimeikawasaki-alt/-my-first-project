import apiClient from './client';
import type { ShiftRequirement, ApiResponse } from '../types';

export async function getShiftRequirements(params?: { groupId?: string }) {
  const res = await apiClient.get<ApiResponse<ShiftRequirement[]>>('/shift-requirements', { params });
  return res.data;
}

export async function createShiftRequirement(data: {
  shiftTypeId: string;
  dayOfWeek?: number | null;
  dateType?: string;
  requiredStaff: number;
  groupId?: string | null;
  isActive?: boolean;
}) {
  const res = await apiClient.post<ApiResponse<ShiftRequirement>>('/shift-requirements', data);
  return res.data;
}

export async function updateShiftRequirement(id: string, data: Partial<{
  shiftTypeId: string;
  dayOfWeek: number | null;
  dateType: string;
  requiredStaff: number;
  groupId: string | null;
  isActive: boolean;
}>) {
  const res = await apiClient.put<ApiResponse<ShiftRequirement>>(`/shift-requirements/${id}`, data);
  return res.data;
}

export async function deleteShiftRequirement(id: string) {
  const res = await apiClient.delete<ApiResponse<{ message: string }>>(`/shift-requirements/${id}`);
  return res.data;
}

export async function bulkUpsertShiftRequirements(requirements: Array<{
  shiftTypeId: string;
  dayOfWeek?: number | null;
  dateType?: string;
  requiredStaff: number;
  groupId?: string | null;
  isActive?: boolean;
}>) {
  const res = await apiClient.post<ApiResponse<{ count: number }>>('/shift-requirements/bulk', requirements);
  return res.data;
}
