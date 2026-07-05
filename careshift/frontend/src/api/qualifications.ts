import apiClient from './client';
import type { ApiResponse, Qualification, StaffQualificationRow } from '../types';

export async function getQualifications() {
  const res = await apiClient.get<ApiResponse<Qualification[]>>('/qualifications');
  return res.data;
}

export async function createQualification(data: Partial<Qualification>) {
  const res = await apiClient.post<ApiResponse<Qualification>>('/qualifications', data);
  return res.data;
}

export async function updateQualification(id: string, data: Partial<Qualification>) {
  const res = await apiClient.put<ApiResponse<Qualification>>(`/qualifications/${id}`, data);
  return res.data;
}

export async function getStaffQualifications(userId?: string) {
  const res = await apiClient.get<ApiResponse<StaffQualificationRow[]>>('/qualifications/staff', {
    params: userId ? { userId } : undefined,
  });
  return res.data;
}

export async function getMyQualifications() {
  const res = await apiClient.get<ApiResponse<StaffQualificationRow[]>>('/qualifications/my');
  return res.data;
}

export async function getExpiringQualifications() {
  const res = await apiClient.get<ApiResponse<StaffQualificationRow[]>>('/qualifications/expiring');
  return res.data;
}

export async function assignQualification(data: {
  userId: string; qualificationId: string; acquiredDate: string;
  expiryDate?: string | null; certificateNo?: string | null; notes?: string | null;
}) {
  const res = await apiClient.post<ApiResponse<StaffQualificationRow>>('/qualifications/staff', data);
  return res.data;
}

export async function updateStaffQualification(id: string, data: {
  acquiredDate?: string; expiryDate?: string | null; certificateNo?: string | null; notes?: string | null;
}) {
  const res = await apiClient.put<ApiResponse<StaffQualificationRow>>(`/qualifications/staff/${id}`, data);
  return res.data;
}

export async function deleteStaffQualification(id: string) {
  const res = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/qualifications/staff/${id}`);
  return res.data;
}
