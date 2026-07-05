import apiClient from './client';
import type { ApiResponse, BankAccountRow, StaffBankAccount, TransferPreview, TransferBatch } from '../types';

export async function getBankAccounts() {
  const res = await apiClient.get<ApiResponse<BankAccountRow[]>>('/payroll-transfer/accounts');
  return res.data;
}

export async function saveBankAccount(userId: string, data: Omit<StaffBankAccount, 'id' | 'userId'>) {
  const res = await apiClient.put<ApiResponse<StaffBankAccount>>(`/payroll-transfer/accounts/${userId}`, data);
  return res.data;
}

export async function getTransferPreview(params: { year: number; month: number }) {
  const res = await apiClient.get<ApiResponse<TransferPreview>>('/payroll-transfer/preview', { params });
  return res.data;
}

export async function getTransferBatches() {
  const res = await apiClient.get<ApiResponse<TransferBatch[]>>('/payroll-transfer/batches');
  return res.data;
}

export interface GenerateTransferInput {
  year: number; month: number; transferDate: string;
  consignorCode: string; consignorName: string;
  bankCode: string; bankName: string; branchCode: string; branchName: string;
  accountType: 'ORDINARY' | 'CHECKING'; accountNumber: string;
}

export async function generateTransfer(data: GenerateTransferInput) {
  const res = await apiClient.post<ApiResponse<{ batchId: string; count: number; totalAmount: number; missingCount: number; fileName: string }>>(
    '/payroll-transfer/generate', data,
  );
  return res.data;
}

/** バッチの全銀協ファイルのダウンロードURL（新規タブ/aタグで開く）。 */
export function transferDownloadUrl(batchId: string): string {
  const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  return `${base}/payroll-transfer/batches/${batchId}/download`;
}
