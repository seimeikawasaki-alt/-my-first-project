export type UserRole = 'ADMIN' | 'GROUP_LEADER' | 'STAFF';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT';
export type ShiftStatus = 'DRAFT' | 'PUBLISHED' | 'AUTO';
export type AttendanceStatus = 'PUNCHED_IN' | 'ON_BREAK' | 'PUNCHED_OUT' | 'ABSENT' | 'PAID_LEAVE' | 'HOLIDAY_WORK';
export type ShiftRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ShiftRequestType = 'VACATION' | 'PREFERRED' | 'CHANGE';
export type SkillLevel = 'TRAINEE' | 'NORMAL' | 'SENIOR' | 'LEADER';

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
  isNightShift: boolean;
  isActive: boolean;
}

export interface GroupShiftConfig {
  id: string;
  groupId: string;
  maxConsecutive?: number | null;
  maxNightPerMonth?: number | null;
  enableFairDistribution: boolean;
  fairDistributionTarget: 'ALL' | 'NIGHT' | 'EARLY';
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffShiftStats {
  id: string;
  userId: string;
  year: number;
  month: number;
  nightCount: number;
  earlyCount: number;
  lateCount: number;
  dayCount: number;
  holidayCount: number;
  totalWorkDays: number;
  updatedAt: string;
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
  shiftTypeId?: string | null;
  baseMinutes?: number | null;
  isNightShift?: boolean;
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
  requestType: ShiftRequestType;
  targetDate?: string | null;
  shiftTypeId?: string | null;
  reason?: string | null;
  priority: number;
  status: ShiftRequestStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  user?: { lastName: string; firstName: string };
}

export interface ShiftRequirement {
  id: string;
  shiftTypeId: string;
  dayOfWeek?: number | null;
  dateType: 'ALL' | 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY';
  requiredStaff: number;
  groupId?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface ShiftRule {
  id: string | null;
  ruleType: string;
  value: number;
  description?: string | null;
  isActive: boolean;
  createdAt?: string | null;
}

export interface StaffConstraint {
  id?: string;
  userId: string;
  maxWorkDaysPerMonth?: number | null;
  maxNightShifts?: number | null;
  availableDays?: number[] | null;
  unavailableDates?: string[] | null;
  preferredShiftTypes?: string[] | null;
  skillLevel: SkillLevel;
  canWorkNight: boolean;
  requiresPairing: boolean;
  pairingWithUserId?: string | null;
  notPairWithUserId?: string | null;
  notes?: string | null;
}

export interface GenerationWarning {
  type: 'UNDERSTAFFED' | 'OVER_CONSECUTIVE' | 'NIGHT_LIMIT' | 'SKILL_SHORTAGE';
  date: string;
  shiftTypeName: string;
  message: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface UnfilledSlot {
  date: string;
  shiftTypeName: string;
  required: number;
  assigned: number;
  shortage: number;
}

export interface GenerationResult {
  success: boolean;
  fulfilledRate: number;
  totalShifts: number;
  warnings: GenerationWarning[];
  unfilledSlots: UnfilledSlot[];
}

export interface ShiftGenerationLog {
  id: string;
  year: number;
  month: number;
  groupId?: string | null;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
  fulfilledRate: number;
  warnings?: string | null;
  generatedBy: string;
  createdAt: string;
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

// ---- Payroll (Phase 3) ----------------------------------------------------

export type SalaryItemType = 'INCOME' | 'DEDUCTION';
export type CalcType = 'AUTO' | 'MANUAL' | 'FIXED' | 'HOURLY';
export type PayrollStatus = 'DRAFT' | 'CALCULATED' | 'CONFIRMED';

export interface SalaryItem {
  id: string;
  code?: string | null;
  name: string;
  itemType: SalaryItemType;
  calcType: CalcType;
  calcFormula?: string | null;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface PayrollDetailRow {
  id: string;
  salaryItemId: string;
  name: string;
  code?: string | null;
  itemType: SalaryItemType;
  calcType: CalcType;
  amount: number;
  notes?: string | null;
  sortOrder: number;
}

export interface Payroll {
  id: string;
  userId: string;
  year: number;
  month: number;
  status: PayrollStatus;
  totalIncome: number;
  totalDeduction: number;
  netPay: number;
  workDays: number;
  workMinutes: number;
  overtimeMinutes: number;
  lateNightMinutes: number;
  confirmedAt?: string | null;
  modifyReason?: string | null;
  user?: { id: string; userCode: string; lastName: string; firstName: string; employmentType?: string } | null;
  details?: PayrollDetailRow[];
}

// ---- Phase 5: 有給 / 36協定 / シフト交代 / 監査ログ ----------------------

export type ComplianceRisk = 'SAFE' | 'WARNING' | 'CRITICAL';
export interface ComplianceStatus {
  required: boolean;
  usedDays: number;
  remainingRequired: number;
  daysUntilDeadline: number;
  riskLevel: ComplianceRisk;
}

export interface PaidLeaveGrant {
  id: string;
  userId: string;
  grantDate: string;
  grantedDays: number;
  expiryDate: string;
  usedDays: number;
  remainingDays: number;
  fiscalYear: number;
}

export interface PaidLeaveUsage {
  id: string;
  userId: string;
  grantId: string;
  usedDate: string;
  days: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  createdAt: string;
}

export interface PaidLeaveBalance {
  remainingDays: number;
  grants: PaidLeaveGrant[];
  usages: PaidLeaveUsage[];
  compliance: ComplianceStatus & { grantDate?: string | null; grantedDays?: number };
}

export interface PaidLeaveSummaryRow {
  userId: string;
  name: string;
  nameKana?: string;
  grantedDays: number;
  usedDays: number;
  remainingDays: number;
  expiryDate: string | null;
  compliance: ComplianceStatus;
  latestGrantId?: string | null;
}

export type AlertLevel = 'NORMAL' | 'WARNING' | 'EXCEEDED';
export interface OvertimeConfig {
  monthlyLimitHours: number;
  yearlyLimitHours: number;
  specialMonthlyLimit: number;
  specialYearlyLimit: number;
  warningThresholdRate: number;
}
export interface OvertimeStatusRow {
  userId: string;
  name: string;
  nameKana?: string;
  monthlyOvertimeHours: number;
  yearlyTotalHours: number;
  alertLevel: AlertLevel;
}

export interface ShiftSwapResponseRow {
  id: string;
  swapRequestId: string;
  userId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  name?: string;
}
export interface ShiftSwapRequest {
  id: string;
  originalUserId: string;
  shiftId: string;
  reason: string;
  urgency: 'URGENT' | 'PLANNED';
  status: 'OPEN' | 'MATCHED' | 'APPROVED' | 'CANCELLED';
  replacementUserId?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  originalName?: string;
  shift?: Shift | null;
  responses?: ShiftSwapResponseRow[];
  alreadyResponded?: boolean;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  beforeValue?: string | null;
  afterValue?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: { lastName: string; firstName: string; userCode: string } | null;
}
