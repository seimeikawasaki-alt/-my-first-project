import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface GenerationResult {
  success: boolean;
  fulfilledRate: number;
  totalShifts: number;
  warnings: Warning[];
  unfilledSlots: UnfilledSlot[];
}

export interface Warning {
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

interface StaffState {
  id: string;
  maxWorkDaysPerMonth: number | null;
  maxNightShifts: number | null;
  availableDays: number[] | null;
  canWorkNight: boolean;
  skillLevel: string;
  requiresPairing: boolean;
  pairingWithUserId: string | null;
  notPairWithUserId: string | null;
  unavailableDateSet: Set<string>;
  workDays: number;
  nightShifts: number;
  earlyShiftCount: number;
  consecutiveWorkDays: number;
  lastWorkDate: string | null;
  lastWasNight: boolean;
  assignedDates: Set<string>;
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export async function generateShifts(params: {
  year: number;
  month: number;
  groupId?: string;
  overwrite?: boolean;
  adminUserId: string;
}): Promise<GenerationResult> {
  const { year, month, groupId, overwrite = false, adminUserId } = params;

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Load shift types
  const shiftTypes = await prisma.shiftType.findMany({ where: { isActive: true } });
  const shiftTypeMap = new Map(shiftTypes.map(st => [st.id, st]));
  const nightShiftIds = new Set(shiftTypes.filter(st => (st as { isNightShift: boolean }).isNightShift).map(st => st.id));
  const earlyShiftIds = new Set(
    shiftTypes
      .filter(st => !st.isOvernight && st.startTime < '08:00')
      .map(st => st.id)
  );

  const requirements = await prisma.shiftRequirement.findMany({ where: { isActive: true } });

  // Load global rules
  const rules = await prisma.shiftRule.findMany({ where: { isActive: true } });
  const ruleMap: Record<string, number> = {};
  rules.forEach(r => { ruleMap[r.ruleType] = r.value; });

  // Load group config (overrides global rules; non-fatal if table doesn't exist)
  let groupConfig: { maxConsecutive: number | null; maxNightPerMonth: number | null; enableFairDistribution: boolean; fairDistributionTarget: string } | null = null;
  if (groupId) {
    try {
      const gc = await (prisma as unknown as { groupShiftConfig: { findUnique: (args: object) => Promise<unknown> } }).groupShiftConfig.findUnique({ where: { groupId } });
      if (gc) groupConfig = gc as typeof groupConfig;
    } catch {
      // ignore if table doesn't exist yet
    }
  }

  const maxConsecutive = groupConfig?.maxConsecutive ?? ruleMap['MAX_CONSECUTIVE_WORK_DAYS'] ?? 5;
  const maxNightPerMonth = groupConfig?.maxNightPerMonth ?? ruleMap['MAX_NIGHT_SHIFTS_PER_MONTH'] ?? 8;
  const maxConsecutiveNight = ruleMap['MAX_CONSECUTIVE_NIGHT'] ?? 2;
  const minSkilledPerShift = ruleMap['MIN_SKILLED_PER_SHIFT'] ?? 1;
  const enableFairDistribution = groupConfig?.enableFairDistribution ?? true;
  const fairTarget = groupConfig?.fairDistributionTarget ?? 'ALL';

  // Load staff
  const staffWhere: Record<string, unknown> = { isActive: true, role: { not: 'ADMIN' } };
  if (groupId) {
    const members = await prisma.userGroup.findMany({ where: { groupId }, select: { userId: true } });
    staffWhere.id = { in: members.map((m: { userId: string }) => m.userId) };
  }
  const staffList = await prisma.user.findMany({ where: staffWhere, select: { id: true } });
  const staffIds = staffList.map((s: { id: string }) => s.id);

  if (staffIds.length === 0) {
    return { success: false, fulfilledRate: 0, totalShifts: 0, warnings: [], unfilledSlots: [] };
  }

  const constraints = await prisma.staffConstraint.findMany({ where: { userId: { in: staffIds } } });
  const constraintMap = new Map(constraints.map((c: { userId: string }) => [c.userId, c]));

  // Load approved vacation requests
  const vacationRequests = await prisma.shiftRequest.findMany({
    where: {
      userId: { in: staffIds },
      requestType: 'VACATION',
      status: 'APPROVED',
      targetDate: { gte: monthStart, lt: monthEnd },
    },
  });
  const vacationMap = new Map<string, Set<string>>();
  for (const req of vacationRequests) {
    if (!req.targetDate) continue;
    const dk = dateKey(req.targetDate);
    if (!vacationMap.has(req.userId)) vacationMap.set(req.userId, new Set());
    vacationMap.get(req.userId)!.add(dk);
  }

  // Load approved preferred shift requests
  const preferredRequests = await prisma.shiftRequest.findMany({
    where: {
      userId: { in: staffIds },
      requestType: 'PREFERRED',
      status: 'APPROVED',
      targetDate: { gte: monthStart, lt: monthEnd },
    },
  });
  const preferredMap = new Map<string, Map<string, string>>();
  for (const req of preferredRequests) {
    if (!req.shiftTypeId || !req.targetDate) continue;
    const dk = dateKey(req.targetDate);
    if (!preferredMap.has(req.userId)) preferredMap.set(req.userId, new Map());
    preferredMap.get(req.userId)!.set(dk, req.shiftTypeId);
  }

  // Initialize staff state
  const staffStates: StaffState[] = staffIds.map((id: string) => {
    const c = constraintMap.get(id) as {
      maxWorkDaysPerMonth: number | null;
      maxNightShifts: number | null;
      availableDays: string | null;
      canWorkNight: boolean;
      skillLevel: string;
      requiresPairing: boolean;
      pairingWithUserId: string | null;
      notPairWithUserId: string | null;
      unavailableDates: string | null;
    } | undefined;
    const unavailableArr: string[] = c?.unavailableDates ? JSON.parse(c.unavailableDates) : [];
    return {
      id,
      maxWorkDaysPerMonth: c?.maxWorkDaysPerMonth ?? null,
      maxNightShifts: c?.maxNightShifts ?? null,
      availableDays: c?.availableDays ? JSON.parse(c.availableDays) : null,
      canWorkNight: c?.canWorkNight ?? true,
      skillLevel: c?.skillLevel ?? 'NORMAL',
      requiresPairing: c?.requiresPairing ?? false,
      pairingWithUserId: c?.pairingWithUserId ?? null,
      notPairWithUserId: c?.notPairWithUserId ?? null,
      unavailableDateSet: new Set(unavailableArr),
      workDays: 0,
      nightShifts: 0,
      earlyShiftCount: 0,
      consecutiveWorkDays: 0,
      lastWorkDate: null,
      lastWasNight: false,
      assignedDates: new Set(),
    };
  });

  if (overwrite) {
    await prisma.shift.deleteMany({
      where: {
        userId: { in: staffIds },
        shiftDate: { gte: monthStart, lt: monthEnd },
        status: { in: ['DRAFT', 'AUTO'] },
      },
    });
  }

  const warnings: Warning[] = [];
  const unfilledSlots: UnfilledSlot[] = [];
  const generatedShifts: Array<{ userId: string; shiftTypeId: string; shiftDate: Date; status: string; createdBy: string }> = [];
  let totalRequiredSlots = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const dk = dateKey(date);
    const dayOfWeek = date.getUTCDay();

    const dayReqs = getDayRequirements(requirements, dayOfWeek, shiftTypes);
    if (dayReqs.size === 0) continue;

    // Sort: night shifts first so rest-day tracking propagates correctly
    const sortedShiftTypeIds = [...dayReqs.keys()].sort((a, b) => {
      return (nightShiftIds.has(a) ? 0 : 1) - (nightShiftIds.has(b) ? 0 : 1);
    });

    for (const shiftTypeId of sortedShiftTypeIds) {
      const req = dayReqs.get(shiftTypeId)!;
      const shiftType = shiftTypeMap.get(shiftTypeId);
      if (!shiftType) continue;

      totalRequiredSlots += req.min;
      const isNight = nightShiftIds.has(shiftTypeId);
      const isEarly = earlyShiftIds.has(shiftTypeId);

      // Find eligible staff
      const eligible = staffStates.filter(staff => {
        if (staff.assignedDates.has(dk)) return false;
        if (vacationMap.get(staff.id)?.has(dk)) return false;
        if (staff.unavailableDateSet.has(dk)) return false;
        if (!staff.canWorkNight && isNight) return false;
        // HARD: after a night shift, next day must be night or off
        if (staff.lastWasNight && !isNight) return false;
        if (isNight && staff.nightShifts >= maxNightPerMonth) return false;
        if (staff.maxNightShifts !== null && isNight && staff.nightShifts >= staff.maxNightShifts) return false;
        if (staff.maxWorkDaysPerMonth !== null && staff.workDays >= staff.maxWorkDaysPerMonth) return false;
        if (staff.consecutiveWorkDays >= maxConsecutive) return false;
        if (staff.availableDays !== null && !staff.availableDays.includes(dayOfWeek)) return false;
        return true;
      });

      // Fair distribution sort + preference
      const sorted = [...eligible].sort((a, b) => {
        const aPref = preferredMap.get(a.id)?.get(dk) === shiftTypeId ? 0 : 1;
        const bPref = preferredMap.get(b.id)?.get(dk) === shiftTypeId ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;

        if (enableFairDistribution && (fairTarget === 'ALL' || (fairTarget === 'NIGHT' && isNight) || (fairTarget === 'EARLY' && isEarly))) {
          if (isNight) return a.nightShifts - b.nightShifts;
          if (isEarly) return a.earlyShiftCount - b.earlyShiftCount;
          return a.workDays - b.workDays;
        }

        if (isNight) {
          const order = ['LEADER', 'SENIOR', 'NORMAL', 'TRAINEE'];
          const diff = order.indexOf(a.skillLevel) - order.indexOf(b.skillLevel);
          if (diff !== 0) return diff;
        }
        return a.workDays - b.workDays;
      });

      const skillLevels = new Set(['SENIOR', 'LEADER']);
      const needsSkilled = minSkilledPerShift > 0;
      const assigned: StaffState[] = [];

      for (const staff of sorted) {
        if (assigned.length >= req.max) break;
        if (staff.requiresPairing && assigned.length === 0) {
          const othersAvail = sorted.filter(s => s !== staff && !s.requiresPairing).length;
          if (othersAvail === 0) continue;
        }
        assigned.push(staff);
        if (assigned.length >= req.min) {
          const skilledCount = assigned.filter(s => skillLevels.has(s.skillLevel)).length;
          if (!needsSkilled || skilledCount >= minSkilledPerShift) break;
        }
      }

      // Skill shortage warning
      const assignedSkilled = assigned.filter(s => skillLevels.has(s.skillLevel)).length;
      if (needsSkilled && assigned.length > 0 && assignedSkilled < minSkilledPerShift) {
        warnings.push({ type: 'SKILL_SHORTAGE', date: dk, shiftTypeName: shiftType.name, message: `${dk} ${shiftType.name}: 有資格者が不足しています`, severity: 'MEDIUM' });
      }

      if (assigned.length < req.min) {
        const shortage = req.min - assigned.length;
        warnings.push({ type: 'UNDERSTAFFED', date: dk, shiftTypeName: shiftType.name, message: `${dk} ${shiftType.name}: ${shortage}名不足`, severity: shortage >= 2 ? 'HIGH' : 'MEDIUM' });
        unfilledSlots.push({ date: dk, shiftTypeName: shiftType.name, required: req.min, assigned: assigned.length, shortage });
      }

      for (const staff of assigned) {
        generatedShifts.push({ userId: staff.id, shiftTypeId, shiftDate: date, status: 'AUTO', createdBy: adminUserId });
        staff.assignedDates.add(dk);
        staff.workDays++;
        if (isNight) staff.nightShifts++;
        if (isEarly) staff.earlyShiftCount++;

        if (staff.lastWorkDate) {
          const prev = new Date(staff.lastWorkDate + 'T00:00:00Z');
          const diff = Math.round((date.getTime() - prev.getTime()) / 86400000);
          staff.consecutiveWorkDays = diff === 1 ? staff.consecutiveWorkDays + 1 : 1;
        } else {
          staff.consecutiveWorkDays = 1;
        }
        staff.lastWorkDate = dk;
        staff.lastWasNight = isNight;

        if (staff.consecutiveWorkDays > maxConsecutive) {
          warnings.push({ type: 'OVER_CONSECUTIVE', date: dk, shiftTypeName: shiftType.name, message: `スタッフ${staff.id.slice(0, 6)}: 連続勤務${staff.consecutiveWorkDays}日`, severity: 'MEDIUM' });
        }
        if (isNight && staff.nightShifts > maxConsecutiveNight) {
          warnings.push({ type: 'NIGHT_LIMIT', date: dk, shiftTypeName: shiftType.name, message: `スタッフ${staff.id.slice(0, 6)}: 連続夜勤${staff.nightShifts}回`, severity: 'LOW' });
        }
      }
    }

    // Reset consecutive tracking for staff not working today
    for (const staff of staffStates) {
      if (!staff.assignedDates.has(dk)) {
        staff.consecutiveWorkDays = 0;
        if (staff.lastWasNight) staff.lastWasNight = false;
      }
    }
  }

  const seenWarnings = new Set<string>();
  const uniqueWarnings = warnings.filter(w => {
    const key = `${w.type}-${w.date}-${w.shiftTypeName}`;
    if (seenWarnings.has(key)) return false;
    seenWarnings.add(key);
    return true;
  });

  if (generatedShifts.length > 0) {
    await prisma.shift.createMany({ data: generatedShifts, skipDuplicates: true });
  }

  const fulfilledRate = totalRequiredSlots > 0
    ? Math.min(1, generatedShifts.length / totalRequiredSlots)
    : 1;

  // Save StaffShiftStats (non-fatal: may not exist if migration hasn't run)
  try {
    for (const staff of staffStates) {
      if (staff.workDays === 0) continue;
      await (prisma as unknown as { staffShiftStats: { upsert: (args: object) => Promise<unknown> } }).staffShiftStats.upsert({
        where: { userId_year_month: { userId: staff.id, year, month } },
        update: {
          nightCount: staff.nightShifts,
          earlyCount: staff.earlyShiftCount,
          totalWorkDays: staff.workDays,
        },
        create: {
          userId: staff.id,
          year,
          month,
          nightCount: staff.nightShifts,
          earlyCount: staff.earlyShiftCount,
          totalWorkDays: staff.workDays,
        },
      });
    }
  } catch {
    // ignore if table doesn't exist yet
  }

  await prisma.shiftGenerationLog.create({
    data: {
      year,
      month,
      groupId: groupId ?? null,
      status: unfilledSlots.length === 0 ? 'COMPLETED' : 'PARTIAL',
      fulfilledRate,
      warnings: JSON.stringify(uniqueWarnings),
      generatedBy: adminUserId,
    },
  });

  return { success: true, fulfilledRate, totalShifts: generatedShifts.length, warnings: uniqueWarnings, unfilledSlots };
}

function getDayRequirements(
  requirements: Array<{ shiftTypeId: string; dayOfWeek: number | null; minStaff: number; maxStaff: number | null }>,
  dayOfWeek: number,
  shiftTypes: Array<{ id: string }>,
): Map<string, { min: number; max: number }> {
  const result = new Map<string, { min: number; max: number }>();
  for (const st of shiftTypes) {
    const relevant = requirements.filter(r => r.shiftTypeId === st.id);
    if (relevant.length === 0) continue;
    const specific = relevant.find(r => r.dayOfWeek === dayOfWeek);
    const general = relevant.find(r => r.dayOfWeek === null);
    const req = specific ?? general;
    if (!req) continue;
    result.set(st.id, { min: req.minStaff, max: req.maxStaff ?? req.minStaff + 3 });
  }
  return result;
}
