import apiClient from './client';
import type { SalaryItem, ApiResponse } from '../types';

export async function getSalaryItems() {
  const res = await apiClient.get<ApiResponse<SalaryItem[]>>('/salary/items');
  return res.data;
}

export type SalaryItemInput = {
  code?: string | null;
  name: string;
  itemType: 'INCOME' | 'DEDUCTION';
  calcType: 'AUTO' | 'MANUAL' | 'FIXED' | 'HOURLY';
  calcFormula?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export async function createSalaryItem(data: SalaryItemInput) {
  const res = await apiClient.post<ApiResponse<SalaryItem>>('/salary/items', data);
  return res.data;
}

export async function updateSalaryItem(id: string, data: Partial<SalaryItemInput>) {
  const res = await apiClient.put<ApiResponse<SalaryItem>>(`/salary/items/${id}`, data);
  return res.data;
}

export async function deleteSalaryItem(id: string) {
  const res = await apiClient.delete<ApiResponse<{ message: string }>>(`/salary/items/${id}`);
  return res.data;
}

export async function reorderSalaryItems(orderedIds: string[]) {
  const res = await apiClient.put<ApiResponse<SalaryItem[]>>('/salary/items/reorder', { orderedIds });
  return res.data;
}
