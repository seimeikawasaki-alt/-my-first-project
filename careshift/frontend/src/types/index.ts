export type UserRole = 'ADMIN' | 'GROUP_LEADER' | 'STAFF';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';

export interface User {
  id: string;
  userCode: string;
  role: UserRole;
  lastName: string;
  firstName: string;
  lastNameKana?: string | null;
  firstNameKana?: string | null;
  employmentType: EmploymentType;
  hourlyWage?: string | null;
  monthlySalary?: string | null;
  email?: string | null;
  phone?: string | null;
  hireDate?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  groups?: GroupMembership[];
}

export interface Group {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  members?: GroupMember[];
  memberCount?: number;
}

export interface GroupMembership {
  id: string;
  name: string;
  color?: string | null;
  isLeader: boolean;
}

export interface GroupMember {
  id: string;
  userCode: string;
  lastName: string;
  firstName: string;
  employmentType: EmploymentType;
  isLeader: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total: number;
    page: number;
    per_page: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { field: string; message: string }[];
  };
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
