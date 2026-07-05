import apiClient from './client';
import type { ApiResponse, ShiftSwapRequest } from '../types';

export async function createShiftSwap(data: { shiftId: string; reason: string; urgency?: 'URGENT' | 'PLANNED' }) {
  const res = await apiClient.post<ApiResponse<ShiftSwapRequest>>('/shift-swap', data);
  return res.data;
}

export async function getShiftSwaps() {
  const res = await apiClient.get<ApiResponse<ShiftSwapRequest[]>>('/shift-swap');
  return res.data;
}

export async function getAvailableSwaps() {
  const res = await apiClient.get<ApiResponse<ShiftSwapRequest[]>>('/shift-swap/available');
  return res.data;
}

export async function respondToSwap(id: string) {
  const res = await apiClient.post<ApiResponse<{ id: string }>>(`/shift-swap/${id}/respond`, {});
  return res.data;
}

export async function approveSwap(id: string, replacementUserId: string) {
  const res = await apiClient.put<ApiResponse<ShiftSwapRequest>>(`/shift-swap/${id}/approve`, { replacementUserId });
  return res.data;
}

export async function cancelSwap(id: string) {
  const res = await apiClient.put<ApiResponse<ShiftSwapRequest>>(`/shift-swap/${id}/cancel`, {});
  return res.data;
}
