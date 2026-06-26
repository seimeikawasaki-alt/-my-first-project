import apiClient from './client';
import { ApiResponse, User } from '../types';

export interface LoginRequest {
  userCode: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export const authApi = {
  login: (data: LoginRequest) =>
    apiClient.post<ApiResponse<User>>('/auth/login', data),

  logout: () =>
    apiClient.post<ApiResponse<{ message: string }>>('/auth/logout'),

  me: () =>
    apiClient.get<ApiResponse<User>>('/auth/me'),

  changePassword: (data: ChangePasswordRequest) =>
    apiClient.post<ApiResponse<{ message: string }>>('/auth/change-password', data),
};
