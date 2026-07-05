import apiClient from './client';
import type { Payroll, ApiResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export async function calculatePayroll(data: { year: number; month: number; userIds?: string[] }) {
  const res = await apiClient.post<ApiResponse<{ calculatedCount: number; skippedLockedCount: number }>>(
    '/payroll/calculate', data,
  );
  return res.data;
}

export async function getPayrolls(params: { year: number; month: number }) {
  const res = await apiClient.get<ApiResponse<Payroll[]>>('/payroll', { params });
  return res.data;
}

export async function getPayroll(id: string) {
  const res = await apiClient.get<ApiResponse<Payroll>>(`/payroll/${id}`);
  return res.data;
}

export async function updatePayroll(id: string, data: {
  details: { id: string; amount: number }[];
  modifyReason: string;
}) {
  const res = await apiClient.put<ApiResponse<Payroll>>(`/payroll/${id}`, data);
  return res.data;
}

export async function confirmPayroll(id: string) {
  const res = await apiClient.post<ApiResponse<Payroll>>(`/payroll/${id}/confirm`, {});
  return res.data;
}

export async function confirmAllPayrolls(data: { year: number; month: number }) {
  const res = await apiClient.post<ApiResponse<{ confirmedCount: number }>>('/payroll/confirm-all', data);
  return res.data;
}

export async function getMyPayrolls() {
  const res = await apiClient.get<ApiResponse<Payroll[]>>('/payroll/my');
  return res.data;
}

/** URL for the printable payslip (open in a new tab; cookie auth flows same-origin). */
export function payslipPdfUrl(id: string): string {
  return `${API_BASE}/payroll/${id}/pdf`;
}

/** URL for CSV export (open/download in a new tab). */
export function payrollExportUrl(year: number, month: number): string {
  return `${API_BASE}/payroll/export?year=${year}&month=${month}`;
}
