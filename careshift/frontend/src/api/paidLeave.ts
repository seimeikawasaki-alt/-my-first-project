import apiClient from './client';
import type { ApiResponse, PaidLeaveBalance, PaidLeaveSummaryRow, PaidLeaveUsage, PaidLeaveGrant } from '../types';

export async function getPaidLeaveSummary() {
  const res = await apiClient.get<ApiResponse<PaidLeaveSummaryRow[]>>('/paid-leave/summary');
  return res.data;
}

export async function getMyPaidLeave() {
  const res = await apiClient.get<ApiResponse<PaidLeaveBalance>>('/paid-leave/my');
  return res.data;
}

export async function getPaidLeaveForUser(userId: string) {
  const res = await apiClient.get<ApiResponse<PaidLeaveBalance>>(`/paid-leave/${userId}`);
  return res.data;
}

export async function grantPaidLeave(data: { auto?: boolean; userId?: string; days?: number }) {
  const res = await apiClient.post<ApiResponse<{ grantedCount?: number } | PaidLeaveGrant>>('/paid-leave/grant', data);
  return res.data;
}

export async function updatePaidLeaveGrant(
  id: string,
  data: { grantedDays?: number; usedDays?: number; remainingDays?: number; expiryDate?: string },
) {
  const res = await apiClient.put<ApiResponse<PaidLeaveGrant>>(`/paid-leave/grant/${id}`, data);
  return res.data;
}

export async function usePaidLeave(data: { userId?: string; usedDate: string; days: number; reason?: string | null }) {
  const res = await apiClient.post<ApiResponse<PaidLeaveUsage>>('/paid-leave/use', data);
  return res.data;
}

export async function approvePaidLeave(id: string) {
  const res = await apiClient.put<ApiResponse<PaidLeaveUsage>>(`/paid-leave/${id}/approve`, {});
  return res.data;
}
