import apiClient from './client';
import type { ApiResponse, AuditLog } from '../types';

export interface AuditLogParams {
  page?: number;
  per_page?: number;
  action?: string;
  userId?: string;
  from?: string;
  to?: string;
}

export async function getAuditLogs(params?: AuditLogParams) {
  const res = await apiClient.get<ApiResponse<AuditLog[]>>('/audit-logs', { params });
  return res.data;
}

/** URL for CSV export is built client-side; the list endpoint returns JSON,
 *  so CSV is generated on the frontend from the fetched rows. */
