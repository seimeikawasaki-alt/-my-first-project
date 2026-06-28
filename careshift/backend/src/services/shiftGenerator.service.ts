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
  minWorkDaysPerMonth: number | null;
  maxNightShifts: number | null;
  availableDays: number[] | null;
  canWorkNight: boolean;
  skillLevel: string;
  requiresPairing: boolean;
  pairingWithUserId: string | null;
  notPairWithUserId: string | null;
  unavailableDateSet: Set<string>;
  // Dates where ONLY night shifts are allowed (day after night shift)
  nightRestOnlyDates: Set<string>;
  workDays: number;
  nightShifts: number;
  earlyShiftCount: number;
  consecutiveWorkDays: number;
  lastWorkDate: string | null;
  assignedDates: Set<string>;
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addUTCDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000);
}

/** Detect night shift: prefer isNightShift field, fall back to isOvernight */
function isNightShiftType(st: { isOvernight: boolean; isNightShift?: boolean }): boolean {
  const ns = (st as { isNightShift?: boolean }).isNightShift;
  return ns != null ? ns : st.isOvernight;
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
  const nightShiftIds = new Set(
    shiftTypes.filter(st => isNightShiftType(st as { isOvernight: boolean; isNightShift?: boolean })).map(st => st.id)
  );
  const earlyShiftIds = new Set(
    shiftTypes.filter(st => !st.isOvernight && st.startTime < '08:00').map(st => st.id)
  );

  const requirements = await prisma.shiftRequirement.findMany({ where: { isActive: true } });

  // Load global rules
  const rules = await prisma.shiftRule.findMany({ where: { isActive: true } });
  const ruleMap: Record<string, number> = {};
  rules.forEach(r => { ruleMap[r.ruleType] = r.value; });

  // Load group config (non-fatal)
  let groupConfig: {
    maxConsecutive: number | null;
    maxNightPerMonth: number | null;
    enableFairDistribution: boolean;
    fairDistributionTarget: string;
  } | null = null;
  if (groupId) {
    try {
      const gc = await (prisma as unknown as {
        groupShiftConfig: { findUnique: (args: object) => Promise<unknown> };
      }).groupShiftConfig.findUnique({ where: { groupId } });
      if (gc) groupConfig = gc as typeof groupConfig;
    } catch { /* table may not exist yet */ }
  }

  const maxConsecutive = groupConfig?.maxConsecutive ?? ruleMap['MAX_CONSECUTIVE_WORK_DAYS'] ?? 5;
  const maxNightPerMonth = groupConfig?.maxNightPerMonth ?? ruleMap['MAX_NIGHT_SHIFTS_PER_MONTH'] ?? 8;
  const maxConsecutiveNight = ruleMap['MAX_CONSECUTIVE_NIGHT'] ?? 2;
  const minSkilledPerShift = ruleMap['MIN_SKILLED_PER_SHIFT'] ?? 1;
  const minRestAfterNight = ruleMap['MIN_REST_AFTER_NIGHT'] ?? 16;
  const minWorkDaysPerMonth = ruleMap['MIN_WORK_DAYS_PER_MONTH'] ?? 0;
  const enableFairDistribution = groupConfig?.enableFairDistribution ?? true;
  const fairTarget = groupConfig?.fairDistributionTarget ?? 'ALL';

  console.log(`[generateShifts] year=${year} month=${month} groupId=${groupId ?? 'ALL'} overwrite=${overwrite} nightShiftIds=[${[...nightShiftIds].join(',')}] minRestAfterNight=${minRestAfterNight}h`);

  // How many calendar days to block after a night shift
  // Night shift ends next morning (isOvernight), so count from the start day
  // MIN_REST_AFTER_NIGHT=16: 夜勤22:00-07:00 → ends 07:00 +16h = 23:00 next day → block 1 day
  // MIN_REST_AFTER_NIGHT=32: ends 07:00 +32h = 15:00 day+2 → block 2 days
  const nightRestBlockDays = Math.max(1, Math.ceil(minRestAfterNight / 24));

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
    where: { userId: { in: staffIds }, requestType: 'VACATION', status: 'APPROVED', targetDate: { gte: monthStart, lt: monthEnd } },
  });
  const vacationMap = new Map<string, Set<string>>();
  for (const req of vacationRequests) {
    if (!req.targetDate) continue;
    const dk = dateKey(req.targetDate);
    if (!vacationMap.has(req.userId)) vacationMap.set(req.userId, new Set());
    vacationMap.get(req.userId)!.add(dk);
  }

  // Load approved preferred requests
  const preferredRequests = await prisma.shiftRequest.findMany({
    where: { userId: { in: staffIds }, requestType: 'PREFERRED', status: 'APPROVED', targetDate: { gte: monthStart, lt: monthEnd } },
  });
  const preferredMap = new Map<string, Map<string, string>>();
  for (const req of preferredRequests) {
    if (!req.shiftTypeId || !req.targetDate) continue;
    const dk = dateKey(req.targetDate);
    if (!preferredMap.has(req.userId)) preferredMap.set(req.userId, new Map());
    preferredMap.get(req.userId)!.set(dk, req.shiftTypeId);
  }

  // Initialize staff states
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
      minWorkDaysPerMonth: minWorkDaysPerMonth > 0 ? minWorkDaysPerMonth : null,
      maxNightShifts: c?.maxNightShifts ?? null,
      availableDays: c?.availableDays ? JSON.parse(c.availableDays) : null,
      canWorkNight: c?.canWorkNight ?? true,
      skillLevel: c?.skillLevel ?? 'NORMAL',
      requiresPairing: c?.requiresPairing ?? false,
      pairingWithUserId: c?.pairingWithUserId ?? null,
      notPairWithUserId: c?.notPairWithUserId ?? null,
      unavailableDateSet: new Set(unavailableArr),
      nightRestOnlyDates: new Set(),
      workDays: 0,
      nightShifts: 0,
      earlyShiftCount: 0,
      consecutiveWorkDays: 0,
      lastWorkDate: null,
      assignedDates: new Set(),
    };
  });

  if (overwrite) {
    await prisma.shift.deleteMany({
      where: { userId: { in: staffIds }, shiftDate: { gte: monthStart, lt: monthEnd }, status: { in: ['DRAFT', 'AUTO'] } },
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

    // Process night shifts first so nightRestOnlyDates propagate before day shifts
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

      const eligible = staffStates.filter(staff => {
        if (staff.assignedDates.has(dk)) return false;
        if (vacationMap.get(staff.id)?.has(dk)) return false;
        if (staff.unavailableDateSet.has(dk)) return false;
        // HARD rule: day after night shift → only night shifts allowed
        if (staff.nightRestOnlyDates.has(dk) && !isNight) return false;
        if (!staff.canWorkNight && isNight) return false;
        if (isNight && staff.nightShifts >= maxNightPerMonth) return false;
        if (staff.maxNightShifts !== null && isNight && staff.nightShifts >= staff.maxNightShifts) return false;
        if (staff.maxWorkDaysPerMonth !== null && staff.workDays >= staff.maxWorkDaysPerMonth) return false;
        if (staff.consecutiveWorkDays >= maxConsecutive) return false;
        if (staff.availableDays !== null && !staff.availableDays.includes(dayOfWeek)) return false;
        return true;
      });

      // Sort: prefer staff below minimum work days, then fair distribution, then least work days
      const sorted = [...eligible].sort((a, b) => {
        // Preferred shift request comes first
        const aPref = preferredMap.get(a.id)?.get(dk) === shiftTypeId ? 0 : 1;
        const bPref = preferredMap.get(b.id)?.get(dk) === shiftTypeId ? 0 : 1;
        if (aPref !== bPref) return aPref - bPref;

        // Staff below minimum work days get priority
        const aUnder = a.minWorkDaysPerMonth != null && a.workDays < a.minWorkDaysPerMonth ? 0 : 1;
        const bUnder = b.minWorkDaysPerMonth != null && b.workDays < b.minWorkDaysPerMonth ? 0 : 1;
        if (aUnder !== bUnder) return aUnder - bUnder;

        // Fair distribution
        if (enableFairDistribution) {
          if (isNight && (fairTarget === 'ALL' || fairTarget === 'NIGHT')) return a.nightShifts - b.nightShifts;
          if (isEarly && (fairTarget === 'ALL' || fairTarget === 'EARLY')) return a.earlyShiftCount - b.earlyShiftCount;
        }

        if (isNight) {
          const order = ['LEADER', 'SENIOR', 'NORMAL', 'TRAINEE'];
          const diff = order.indexOf(a.skillLevel) - order.indexOf(b.skillLevel);
          if (diff !== 0) return diff;
        }
        return a.workDays - b.workDays;
      });

      const skillLevels = new Set(['SENIOR', 'LEADER']);
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
          if (!minSkilledPerShift || skilledCount >= minSkilledPerShift) break;
        }
      }

      // Skill shortage warning
      const assignedSkilled = assigned.filter(s => skillLevels.has(s.skillLevel)).length;
      if (minSkilledPerShift && assigned.length > 0 && assignedSkilled < minSkilledPerShift) {
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
        if (isNight) {
          staff.nightShifts++;
          // Block next N calendar days: only night shifts allowed (MIN_REST_AFTER_NIGHT)
          for (let r = 1; r <= nightRestBlockDays; r++) {
            const restDate = addUTCDays(date, r);
            const restDk = dateKey(restDate);
            if (r === 1) {
              // Day immediately after: can still do consecutive night shifts
              staff.nightRestOnlyDates.add(restDk);
            } else {
              // Further days (when minRestAfterNight > 24h): fully blocked
              staff.unavailableDateSet.add(restDk);
            }
          }
        }
        if (isEarly) staff.earlyShiftCount++;

        if (staff.lastWorkDate) {
          const prev = new Date(staff.lastWorkDate + 'T00:00:00Z');
          const diff = Math.round((date.getTime() - prev.getTime()) / 86400000);
          staff.consecutiveWorkDays = diff === 1 ? staff.consecutiveWorkDays + 1 : 1;
        } else {
          staff.consecutiveWorkDays = 1;
        }
        staff.lastWorkDate = dk;

        if (staff.consecutiveWorkDays > maxConsecutive) {
          warnings.push({ type: 'OVER_CONSECUTIVE', date: dk, shiftTypeName: shiftType.name, message: `スタッフ${staff.id.slice(0, 6)}: 連続勤務${staff.consecutiveWorkDays}日`, severity: 'MEDIUM' });
        }
        if (isNight && staff.nightShifts > maxConsecutiveNight) {
          warnings.push({ type: 'NIGHT_LIMIT', date: dk, shiftTypeName: shiftType.name, message: `スタッフ${staff.id.slice(0, 6)}: 連続夜勤${staff.nightShifts}回`, severity: 'LOW' });
        }
      }
    }

    // Reset consecutive tracking for staff not assigned today
    for (const staff of staffStates) {
      if (!staff.assignedDates.has(dk)) {
        staff.consecutiveWorkDays = 0;
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

  const fulfilledRate = totalRequiredSlots > 0 ? Math.min(1, generatedShifts.length / totalRequiredSlots) : 1;

  const totalNight = staffStates.reduce((acc, s) => acc + s.nightShifts, 0);
  console.log(`[generateShifts] done: totalShifts=${generatedShifts.length} totalNightShifts=${totalNight} (night-after-night rest rule active)`);

  // Save StaffShiftStats (non-fatal)
  try {
    for (const staff of staffStates) {
      if (staff.workDays === 0) continue;
      await (prisma as unknown as {
        staffShiftStats: { upsert: (args: object) => Promise<unknown> };
      }).staffShiftStats.upsert({
        where: { userId_year_month: { userId: staff.id, year, month } },
        update: { nightCount: staff.nightShifts, earlyCount: staff.earlyShiftCount, totalWorkDays: staff.workDays },
        create: { userId: staff.id, year, month, nightCount: staff.nightShifts, earlyCount: staff.earlyShiftCount, totalWorkDays: staff.workDays },
      });
    }
  } catch { /* ignore if table doesn't exist yet */ }

  await prisma.shiftGenerationLog.create({
    data: {
      year, month, groupId: groupId ?? null,
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
