import apiClient from './client';
import type { GroupShiftConfig } from '../types';

export async function getGroupShiftConfig(groupId: string): Promise<GroupShiftConfig | null> {
  const res = await apiClient.get<{ success: boolean; data: GroupShiftConfig | null }>(`/groups/${groupId}/shift-config`);
  return res.data.data;
}

export async function upsertGroupShiftConfig(groupId: string, data: Partial<Omit<GroupShiftConfig, 'id' | 'groupId' | 'createdAt' | 'updatedAt'>>): Promise<GroupShiftConfig> {
  const res = await apiClient.put<{ success: boolean; data: GroupShiftConfig }>(`/groups/${groupId}/shift-config`, data);
  return res.data.data;
}
