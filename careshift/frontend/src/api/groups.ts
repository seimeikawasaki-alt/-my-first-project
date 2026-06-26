import apiClient from './client';
import { ApiResponse, Group } from '../types';

export interface GroupCreateRequest {
  name: string;
  color?: string | null;
  description?: string | null;
}

export interface AddMemberRequest {
  userId: string;
  isLeader?: boolean;
}

export const groupsApi = {
  list: () =>
    apiClient.get<ApiResponse<Group[]>>('/groups'),

  create: (data: GroupCreateRequest) =>
    apiClient.post<ApiResponse<Group>>('/groups', data),

  update: (id: string, data: GroupCreateRequest) =>
    apiClient.put<ApiResponse<Group>>(`/groups/${id}`, data),

  delete: (id: string) =>
    apiClient.delete<ApiResponse<{ message: string }>>(`/groups/${id}`),

  addMember: (groupId: string, data: AddMemberRequest) =>
    apiClient.post<ApiResponse<unknown>>(`/groups/${groupId}/members`, data),

  removeMember: (groupId: string, userId: string) =>
    apiClient.delete<ApiResponse<{ message: string }>>(`/groups/${groupId}/members/${userId}`),
};
