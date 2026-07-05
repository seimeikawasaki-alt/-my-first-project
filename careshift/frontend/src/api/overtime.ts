import apiClient from './client';
import type { ApiResponse, OvertimeConfig, OvertimeStatusRow } from '../types';

export async function getOvertimeConfig() {
  const res = await apiClient.get<ApiResponse<OvertimeConfig>>('/overtime/config');
  return res.data;
}

export async function updateOvertimeConfig(data: Partial<OvertimeConfig>) {
  const res = await apiClient.put<ApiResponse<OvertimeConfig>>('/overtime/config', data);
  return res.data;
}

export async function getOvertimeStatus(params: { year: number; month: number }) {
  const res = await apiClient.get<ApiResponse<{ config: OvertimeConfig; rows: OvertimeStatusRow[] }>>('/overtime/status', { params });
  return res.data;
}

export async function getOvertimeAlerts(params: { year: number; month: number }) {
  const res = await apiClient.get<ApiResponse<OvertimeStatusRow[]>>('/overtime/alerts', { params });
  return res.data;
}
