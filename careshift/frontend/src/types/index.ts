export type UserRole = 'ADMIN' | 'GROUP_LEADER' | 'STAFF';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
export type ShiftStatus = 'DRAFT' | 'PUBLISHED';
export type AttendanceStatus = 'PUNCHED_IN' | 'ON_BREAK' | 'PUNCHED_OUT' | 'ABSENT' | 'PAID_LEAVE' | 'HOLIDAY_WORK';
export type ShiftRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ShiftRequestType = 'CHANGE' | 'CANCEL' | 'ADD';

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

export interface ShiftType {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  color?: string | null;
  isOvernight: boolean;
  isActive: boolean;
}

export interface Shift {
  id: string;
  userId: string;
  shiftTypeId?: string | null;
  shiftDate: string;
  startTime?: string | null;
  endTime?: string | null;
  status: ShiftStatus;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { lastName: string; firstName: string };
  shiftType?: ShiftType | null;
}

export interface Attendance {
  id: string;
  userId: string;
  workDate: string;
  punchIn?: string | null;
  punchOut?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  status?: AttendanceStatus | null;
  workMinutes?: number | null;
  overtimeMinutes: number;
  lateNightMinutes: number;
  isHolidayWork: boolean;
  notes?: string | null;
  modifiedBy?: string | null;
  modifyReason?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: { lastName: string; firstName: string };
}

export interface AttendanceSummary {
  userId: string;
  lastName: string;
  firstName: string;
  totalWorkMinutes: number;
  totalOvertimeMinutes: number;
  absentDays: number;
  paidLeaveDays: number;
}

export interface ShiftRequest {
  id: string;
  userId: string;
  shiftId?: string | null;
  requestType: ShiftRequestType;
  requestedDate?: string | null;
  reason?: string | null;
  status: ShiftRequestStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  user?: { lastName: string; firstName: string };
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
