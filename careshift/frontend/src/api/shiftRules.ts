import apiClient from './client';
import type { ShiftRule, ApiResponse } from '../types';

export async function getShiftRules() {
  const res = await apiClient.get<ApiResponse<ShiftRule[]>>('/shift-rules');
  return res.data;
}

export async function updateShiftRule(ruleType: string, data: { value: number; isActive?: boolean }) {
  const res = await apiClient.put<ApiResponse<ShiftRule>>(`/shift-rules/${ruleType}`, data);
  return res.data;
}

export async function bulkUpdateShiftRules(rules: Array<{ ruleType: string; value: number; isActive?: boolean }>) {
  const res = await apiClient.post<ApiResponse<ShiftRule[]>>('/shift-rules/bulk', rules);
  return res.data;
}
