import apiClient from './client';
import { ApiResponse, User } from '../types';

export interface StaffListParams {
  page?: number;
  per_page?: number;
  search?: string;
  employment_type?: string;
  group_id?: string;
  is_active?: boolean;
}

export interface StaffCreateRequest {
  userCode: string;
  password: string;
  role?: 'ADMIN' | 'GROUP_LEADER' | 'STAFF';
  lastName: string;
  firstName: string;
  lastNameKana?: string;
  firstNameKana?: string;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
  hourlyWage?: number | null;
  monthlySalary?: number | null;
  email?: string | null;
  phone?: string | null;
  hireDate?: string | null;
  groupIds?: string[];
}

export interface StaffUpdateRequest extends Omit<StaffCreateRequest, 'password'> {
  password?: string;
}

export const staffApi = {
  list: (params?: StaffListParams) =>
    apiClient.get<ApiResponse<User[]>>('/staff', { params }),

  get: (id: string) =>
    apiClient.get<ApiResponse<User>>(`/staff/${id}`),

  create: (data: StaffCreateRequest) =>
    apiClient.post<ApiResponse<User>>('/staff', data),

  update: (id: string, data: StaffUpdateRequest) =>
    apiClient.put<ApiResponse<User>>(`/staff/${id}`, data),

  deactivate: (id: string) =>
    apiClient.delete<ApiResponse<{ message: string }>>(`/staff/${id}`),
};
