import apiClient from './client';
import type { StaffConstraint, ApiResponse } from '../types';

export async function getStaffConstraint(userId: string) {
  const res = await apiClient.get<ApiResponse<StaffConstraint>>(`/staff-constraints/${userId}`);
  return res.data;
}

export async function upsertStaffConstraint(userId: string, data: Partial<Omit<StaffConstraint, 'id' | 'userId'>>) {
  const res = await apiClient.put<ApiResponse<StaffConstraint>>(`/staff-constraints/${userId}`, data);
  return res.data;
}
