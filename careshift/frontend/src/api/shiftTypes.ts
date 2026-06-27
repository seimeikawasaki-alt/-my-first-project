import apiClient from './client';
import type { ShiftType, ApiResponse } from '../types';

export async function getShiftTypes() {
  const res = await apiClient.get<ApiResponse<ShiftType[]>>('/shift-types');
  return res.data;
}

export async function createShiftType(data: Omit<ShiftType, 'id'>) {
  const res = await apiClient.post<ApiResponse<ShiftType>>('/shift-types', data);
  return res.data;
}

export async function updateShiftType(id: string, data: Partial<Omit<ShiftType, 'id'>>) {
  const res = await apiClient.put<ApiResponse<ShiftType>>(`/shift-types/${id}`, data);
  return res.data;
}

export async function deleteShiftType(id: string) {
  const res = await apiClient.delete<ApiResponse<{ message: string }>>(`/shift-types/${id}`);
  return res.data;
}
