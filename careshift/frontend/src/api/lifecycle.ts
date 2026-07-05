import apiClient from './client';
import type { ApiResponse, LifecycleEvent, OffboardingChecklistItem, RetiredStaffRow } from '../types';

export async function getRetiredStaff() {
  const res = await apiClient.get<ApiResponse<RetiredStaffRow[]>>('/lifecycle/retired');
  return res.data;
}

export async function getLifecycleEvents(userId: string) {
  const res = await apiClient.get<ApiResponse<LifecycleEvent[]>>(`/lifecycle/events/${userId}`);
  return res.data;
}

export async function getOffboardingChecklist(userId: string) {
  const res = await apiClient.get<ApiResponse<OffboardingChecklistItem[]>>(`/lifecycle/checklist/${userId}`);
  return res.data;
}

export async function updateChecklistItem(id: string, isDone: boolean) {
  const res = await apiClient.put<ApiResponse<OffboardingChecklistItem>>(`/lifecycle/checklist/item/${id}`, { isDone });
  return res.data;
}

export async function processOnboarding(data: { userId: string; eventDate: string; notes?: string | null }) {
  const res = await apiClient.post<ApiResponse<{ userId: string; eventId: string }>>('/lifecycle/onboarding', data);
  return res.data;
}

export async function processOffboarding(data: { userId: string; retirementDate: string; notes?: string | null }) {
  const res = await apiClient.post<ApiResponse<{ userId: string; deletedFutureShifts: number; dataRetentionUntil: string; checklistCreated: number }>>(
    '/lifecycle/offboarding', data,
  );
  return res.data;
}
