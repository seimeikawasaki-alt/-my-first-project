import { PrismaClient } from '@prisma/client';
import { overloadedUserIds } from './overtime.service.js';
import { dateKey, addUTCDays, consecutiveEndingAt, projectNightRest } from './shiftRules.calc.js';

const prisma = new PrismaClient();

/** グループ別シフト設定（GroupShiftConfig）のうち生成で参照するフィールド。 */
interface GroupShiftConfigData {
  maxConsecutive: number | null;
  maxNightPerMonth: number | null;
  enableFairDistribution: boolean;
  fairDistributionTarget: string;
}

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
  // Consecutive night-shift tracking
  consecutiveNights: number;
  lastNightDate: string | null;
  assignedDates: Set<string>;
  // 同点候補をランダムに選ぶための一時的な乱数値（枠ごとに振り直す）
  tie: number;
}

type RequirementRow = { shiftTypeId: string; dayOfWeek: number | null; requiredStaff: number; groupId: string | null };

/** Detect night shift: prefer isNightShift field, fall back to isOvernight */
function isNightShiftType(st: { isOvernight: boolean; isNightShift?: boolean }): boolean {
  const ns = st.isNightShift;
  return ns != null ? ns : st.isOvernight;
}

/**
 * 決定的な擬似乱数（mulberry32）。同じ seed なら同じ結果を再現でき、
 * seed を変える（既定では毎回変わる）と別パターンになる。
 * ハードルール・公平分配は維持したまま、「同点候補」の選択にだけ使う。
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function generateShifts(params: {
  year: number;
  month: number;
  groupId?: string;
  overwrite?: boolean;
  adminUserId: string;
  /** 乱数シード。省略時は毎回変わる（＝毎回違うパターン）。指定すると同じ結果を再現できる。 */
  seed?: number;
}): Promise<GenerationResult> {
  const { year, month, groupId, overwrite = false, adminUserId } = params;
  // シードが未指定なら現在時刻から生成 → 実行のたびに別パターンになる
  const rng = mulberry32(params.seed ?? (Date.now() ^ (Math.random() * 0x100000000)) >>> 0);

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

  // Load all requirements once; filter per group below
  const allRequirements = (await prisma.shiftRequirement.findMany({ where: { isActive: true } })) as unknown as RequirementRow[];
  const globalRequirements = allRequirements.filter(r => r.groupId == null);

  // Load global rules
  const rules = await prisma.shiftRule.findMany({ where: { isActive: true } });
  const ruleMap: Record<string, number> = {};
  rules.forEach(r => { ruleMap[r.ruleType] = r.value; });

  const globalMaxConsecutive = ruleMap['MAX_CONSECUTIVE_WORK_DAYS'] ?? 5;
  const globalMaxNight = ruleMap['MAX_NIGHT_SHIFTS_PER_MONTH'] ?? 8;
  const maxConsecutiveNight = ruleMap['MAX_CONSECUTIVE_NIGHT'] ?? 2;
  const minRestAfterNight = ruleMap['MIN_REST_AFTER_NIGHT'] ?? 16;
  const minWorkDaysPerMonth = ruleMap['MIN_WORK_DAYS_PER_MONTH'] ?? 0;

  // How many calendar days to block after a night shift (MIN_REST_AFTER_NIGHT)
  const nightRestBlockDays = Math.max(1, Math.ceil(minRestAfterNight / 24));

  // 36協定: 残業が警告/超過レベルのスタッフには夜勤を優先的に割り当てない
  const overloadedSet = await overloadedUserIds(year, month);

  // Determine target groups: a single group, or every group (Plan A: per-group generation)
  const targetGroupIds = groupId
    ? [groupId]
    : (await prisma.group.findMany({ select: { id: true } })).map((g: { id: string }) => g.id);

  console.log(`[generateShifts] year=${year} month=${month} groups=[${targetGroupIds.join(',')}] overwrite=${overwrite} nightShiftIds=[${[...nightShiftIds].join(',')}] minRestAfterNight=${minRestAfterNight}h`);

  if (targetGroupIds.length === 0) {
    return { success: false, fulfilledRate: 0, totalShifts: 0, warnings: [], unfilledSlots: [] };
  }

  // Load group membership across all target groups
  const groupMembers = await prisma.userGroup.findMany({
    where: { groupId: { in: targetGroupIds } },
    select: { userId: true, groupId: true },
  });
  const allStaffIds = [...new Set(groupMembers.map((m: { userId: string }) => m.userId))];

  if (allStaffIds.length === 0) {
    return { success: false, fulfilledRate: 0, totalShifts: 0, warnings: [], unfilledSlots: [] };
  }

  // Keep only active, non-admin staff
  const activeStaff = await prisma.user.findMany({
    where: { id: { in: allStaffIds }, isActive: true, role: { not: 'ADMIN' } },
    select: { id: true },
  });
  const activeStaffSet = new Set(activeStaff.map((s: { id: string }) => s.id));

  // Overwrite: clear existing DRAFT/AUTO shifts once for all involved staff
  // Always clear previously auto-generated (and draft) shifts for the target staff
  // so regeneration is fresh and never accumulates beyond the required number.
  await prisma.shift.deleteMany({
    where: { userId: { in: allStaffIds }, shiftDate: { gte: monthStart, lt: monthEnd }, status: { in: ['DRAFT', 'AUTO'] } },
  });
  // "上書き" additionally replaces confirmed (published) shifts.
  if (overwrite) {
    await prisma.shift.deleteMany({
      where: { userId: { in: allStaffIds }, shiftDate: { gte: monthStart, lt: monthEnd }, status: 'PUBLISHED' },
    });
  }

  // Constraints
  const constraints = await prisma.staffConstraint.findMany({ where: { userId: { in: allStaffIds } } });
  const constraintMap = new Map(constraints.map((c: { userId: string }) => [c.userId, c]));

  // Approved vacation requests
  const vacationRequests = await prisma.shiftRequest.findMany({
    where: { userId: { in: allStaffIds }, requestType: 'VACATION', status: 'APPROVED', targetDate: { gte: monthStart, lt: monthEnd } },
  });
  const vacationMap = new Map<string, Set<string>>();
  for (const req of vacationRequests) {
    if (!req.targetDate) continue;
    const dk = dateKey(req.targetDate);
    if (!vacationMap.has(req.userId)) vacationMap.set(req.userId, new Set());
    vacationMap.get(req.userId)!.add(dk);
  }

  // Approved preferred requests
  const preferredRequests = await prisma.shiftRequest.findMany({
    where: { userId: { in: allStaffIds }, requestType: 'PREFERRED', status: 'APPROVED', targetDate: { gte: monthStart, lt: monthEnd } },
  });
  const preferredMap = new Map<string, Map<string, string>>();
  for (const req of preferredRequests) {
    if (!req.shiftTypeId || !req.targetDate) continue;
    const dk = dateKey(req.targetDate);
    if (!preferredMap.has(req.userId)) preferredMap.set(req.userId, new Map());
    preferredMap.get(req.userId)!.set(dk, req.shiftTypeId);
  }

  // Remaining shifts (preserved published ones) → avoid double-booking and count
  // them toward requirements so the total never exceeds the required number.
  const existingShifts = await prisma.shift.findMany({
    where: { userId: { in: allStaffIds }, shiftDate: { gte: monthStart, lt: monthEnd } },
    select: { userId: true, shiftDate: true, shiftTypeId: true },
  });
  const globalAssignedKeys = new Set<string>();
  const existingBySlot = new Map<string, Set<string>>(); // `${dk}|${shiftTypeId}` → userIds
  for (const s of existingShifts) {
    const dk = dateKey(s.shiftDate);
    globalAssignedKeys.add(`${s.userId}|${dk}`);
    const slot = `${dk}|${s.shiftTypeId}`;
    if (!existingBySlot.has(slot)) existingBySlot.set(slot, new Set());
    existingBySlot.get(slot)!.add(s.userId);
  }

  // ---- 前月末の状況を取得（月またぎの継続判定用）----
  // 夜勤翌日ルール・連続夜勤・連続勤務日数は、前月末のシフトを引き継がないと
  // 月初でリセットされてしまう。前月分の確定/自動シフトを読み込んでおく。
  const prevMonthStart = new Date(Date.UTC(year, month - 2, 1));
  const prevLastDay = addUTCDays(monthStart, -1); // 前月末日
  const prevLastKey = dateKey(prevLastDay);
  const prevShifts = await prisma.shift.findMany({
    where: {
      userId: { in: allStaffIds },
      shiftDate: { gte: prevMonthStart, lt: monthStart },
      status: { in: ['PUBLISHED', 'AUTO'] },
    },
    select: { userId: true, shiftDate: true, shiftTypeId: true },
  });
  const prevWorkedByUser = new Map<string, Set<string>>(); // userId → 勤務した日キー
  const prevNightByUser = new Map<string, Set<string>>();  // userId → 夜勤だった日キー
  for (const s of prevShifts) {
    const dk = dateKey(s.shiftDate);
    if (!prevWorkedByUser.has(s.userId)) prevWorkedByUser.set(s.userId, new Set());
    prevWorkedByUser.get(s.userId)!.add(dk);
    if (s.shiftTypeId && nightShiftIds.has(s.shiftTypeId)) {
      if (!prevNightByUser.has(s.userId)) prevNightByUser.set(s.userId, new Set());
      prevNightByUser.get(s.userId)!.add(dk);
    }
  }

  const warnings: Warning[] = [];
  const unfilledSlots: UnfilledSlot[] = [];
  const generatedShifts: Array<{ userId: string; shiftTypeId: string; shiftDate: Date; status: string; createdBy: string }> = [];
  let totalRequiredSlots = 0;
  const allStaffStates: StaffState[] = [];
  // Ensure each staff is generated in only one group even if they belong to
  // several (stale/duplicate memberships) — prevents over-work across groups
  const processedStaff = new Set<string>();

  // ---- Generate per group ----
  for (const gid of targetGroupIds) {
    // Group config (non-fatal if table missing)
    let groupConfig: GroupShiftConfigData | null = null;
    try {
      const gc = await prisma.groupShiftConfig.findUnique({ where: { groupId: gid } });
      if (gc) {
        groupConfig = {
          maxConsecutive: gc.maxConsecutive,
          maxNightPerMonth: gc.maxNightPerMonth,
          enableFairDistribution: gc.enableFairDistribution,
          fairDistributionTarget: gc.fairDistributionTarget,
        };
      }
    } catch { /* table may not exist yet */ }

    const maxConsecutive = groupConfig?.maxConsecutive ?? globalMaxConsecutive;
    const maxNightPerMonth = groupConfig?.maxNightPerMonth ?? globalMaxNight;
    const enableFairDistribution = groupConfig?.enableFairDistribution ?? true;
    const fairTarget = groupConfig?.fairDistributionTarget ?? 'ALL';

    // Group staff (skip any already generated in an earlier group)
    const gStaffIds = groupMembers
      .filter((m: { userId: string; groupId: string }) => m.groupId === gid && activeStaffSet.has(m.userId) && !processedStaff.has(m.userId))
      .map((m: { userId: string }) => m.userId);
    if (gStaffIds.length === 0) continue;
    gStaffIds.forEach((id: string) => processedStaff.add(id));
    const gStaffIdsSet = new Set<string>(gStaffIds);

    // Group requirements (fall back to global defaults if none defined)
    let gReqs = allRequirements.filter(r => r.groupId === gid);
    if (gReqs.length === 0) gReqs = globalRequirements;
    if (gReqs.length === 0) continue;

    // Init staff states for this group
    const staffStates: StaffState[] = gStaffIds.map((id: string) => {
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
      const state: StaffState = {
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
        consecutiveNights: 0,
        lastNightDate: null,
        assignedDates: new Set(),
        tie: 0,
      };

      // ---- 前月末からの継続（月またぎ）を初期状態に反映 ----
      const prevWorked = prevWorkedByUser.get(id);
      if (prevWorked) {
        const cw = consecutiveEndingAt(prevWorked, prevLastDay);
        if (cw > 0) { state.consecutiveWorkDays = cw; state.lastWorkDate = prevLastKey; }
      }
      const prevNights = prevNightByUser.get(id);
      if (prevNights && prevNights.size > 0) {
        // 連続夜勤回数を引き継ぐ（前月末が夜勤で終わっている場合）
        const cn = consecutiveEndingAt(prevNights, prevLastDay);
        if (cn > 0) { state.consecutiveNights = cn; state.lastNightDate = prevLastKey; }
        // 夜勤後の休息ブロックを当月へ投影（前月末夜勤 → 当月1日は夜勤か休みのみ）
        const proj = projectNightRest(prevNights, monthStart, monthEnd, nightRestBlockDays);
        proj.nightOnly.forEach(k => state.nightRestOnlyDates.add(k));
        proj.blocked.forEach(k => state.unavailableDateSet.add(k));
      }
      return state;
    });
    allStaffStates.push(...staffStates);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(Date.UTC(year, month - 1, day));
      const dk = dateKey(date);
      const prevDk = dateKey(addUTCDays(date, -1));
      const dayOfWeek = date.getUTCDay();

      const dayReqs = getDayRequirements(gReqs, dayOfWeek, shiftTypes);
      if (dayReqs.size === 0) continue;

      // Process night shifts first so nightRestOnlyDates propagate before day shifts
      const sortedShiftTypeIds = [...dayReqs.keys()].sort((a, b) => {
        return (nightShiftIds.has(a) ? 0 : 1) - (nightShiftIds.has(b) ? 0 : 1);
      });

      for (const shiftTypeId of sortedShiftTypeIds) {
        const required = dayReqs.get(shiftTypeId)!.required;
        if (required <= 0) continue;
        const shiftType = shiftTypeMap.get(shiftTypeId);
        if (!shiftType) continue;

        totalRequiredSlots += required;
        const isNight = nightShiftIds.has(shiftTypeId);
        const isEarly = earlyShiftIds.has(shiftTypeId);

        // Count preserved (published) shifts of this group already filling this
        // slot, so we never assign more than the required number.
        const slotKey = `${dk}|${shiftTypeId}`;
        const existingInSlot = existingBySlot.has(slotKey)
          ? [...existingBySlot.get(slotKey)!].filter(uid => gStaffIdsSet.has(uid)).length
          : 0;
        const toAssign = Math.max(0, required - existingInSlot);

        const eligible = staffStates.filter(staff => {
          if (staff.assignedDates.has(dk)) return false;
          if (globalAssignedKeys.has(`${staff.id}|${dk}`)) return false;
          if (vacationMap.get(staff.id)?.has(dk)) return false;
          if (staff.unavailableDateSet.has(dk)) return false;
          // HARD rule: day after night shift → only night shifts allowed
          if (staff.nightRestOnlyDates.has(dk) && !isNight) return false;
          if (!staff.canWorkNight && isNight) return false;
          if (isNight && staff.nightShifts >= maxNightPerMonth) return false;
          if (staff.maxNightShifts !== null && isNight && staff.nightShifts >= staff.maxNightShifts) return false;
          // Cap consecutive night shifts
          if (isNight && staff.lastNightDate === prevDk && staff.consecutiveNights >= maxConsecutiveNight) return false;
          if (staff.maxWorkDaysPerMonth !== null && staff.workDays >= staff.maxWorkDaysPerMonth) return false;
          if (staff.consecutiveWorkDays >= maxConsecutive) return false;
          if (staff.availableDays !== null && !staff.availableDays.includes(dayOfWeek)) return false;
          return true;
        });

        // 同点候補をランダムに選ぶため、この枠だけの乱数値を各候補に振り直す
        for (const staff of eligible) staff.tie = rng();

        // Sort: preferred request → below minimum days → fair distribution → skill → fewest work days → ランダム
        const sorted = [...eligible].sort((a, b) => {
          const aPref = preferredMap.get(a.id)?.get(dk) === shiftTypeId ? 0 : 1;
          const bPref = preferredMap.get(b.id)?.get(dk) === shiftTypeId ? 0 : 1;
          if (aPref !== bPref) return aPref - bPref;

          const aUnder = a.minWorkDaysPerMonth != null && a.workDays < a.minWorkDaysPerMonth ? 0 : 1;
          const bUnder = b.minWorkDaysPerMonth != null && b.workDays < b.minWorkDaysPerMonth ? 0 : 1;
          if (aUnder !== bUnder) return aUnder - bUnder;

          // 36協定配慮: 残業が上限に近いスタッフは夜勤を後回し
          if (isNight) {
            const aOver = overloadedSet.has(a.id) ? 1 : 0;
            const bOver = overloadedSet.has(b.id) ? 1 : 0;
            if (aOver !== bOver) return aOver - bOver;
          }

          if (enableFairDistribution) {
            if (isNight && (fairTarget === 'ALL' || fairTarget === 'NIGHT')) return a.nightShifts - b.nightShifts;
            if (isEarly && (fairTarget === 'ALL' || fairTarget === 'EARLY')) return a.earlyShiftCount - b.earlyShiftCount;
          }

          if (isNight) {
            const order = ['LEADER', 'SENIOR', 'NORMAL', 'TRAINEE'];
            const diff = order.indexOf(a.skillLevel) - order.indexOf(b.skillLevel);
            if (diff !== 0) return diff;
          }
          // ここまでの条件（ハードルール・公平分配・スキル）で並べたうえで、
          // 勤務日数が同じ＝同点の候補は乱数で選ぶ → 毎回違う結果になる
          if (a.workDays !== b.workDays) return a.workDays - b.workDays;
          return a.tie - b.tie;
        });

        const assigned: StaffState[] = [];

        for (const staff of sorted) {
          if (assigned.length >= toAssign) break;
          if (staff.requiresPairing && assigned.length === 0) {
            const othersAvail = sorted.filter(s => s !== staff && !s.requiresPairing).length;
            if (othersAvail === 0) continue;
          }
          assigned.push(staff);
        }

        const filled = assigned.length + existingInSlot;
        if (filled < required) {
          const shortage = required - filled;
          warnings.push({ type: 'UNDERSTAFFED', date: dk, shiftTypeName: shiftType.name, message: `${dk} ${shiftType.name}: ${shortage}名不足`, severity: shortage >= 2 ? 'HIGH' : 'MEDIUM' });
          unfilledSlots.push({ date: dk, shiftTypeName: shiftType.name, required, assigned: filled, shortage });
        }

        for (const staff of assigned) {
          generatedShifts.push({ userId: staff.id, shiftTypeId, shiftDate: date, status: 'AUTO', createdBy: adminUserId });
          staff.assignedDates.add(dk);
          globalAssignedKeys.add(`${staff.id}|${dk}`);
          staff.workDays++;
          if (isNight) {
            staff.nightShifts++;
            // Track consecutive nights
            staff.consecutiveNights = staff.lastNightDate === prevDk ? staff.consecutiveNights + 1 : 1;
            staff.lastNightDate = dk;
            // Block next N calendar days after a night shift (MIN_REST_AFTER_NIGHT)
            for (let r = 1; r <= nightRestBlockDays; r++) {
              const restDk = dateKey(addUTCDays(date, r));
              if (r === 1) {
                staff.nightRestOnlyDates.add(restDk); // only night allowed the next day
              } else {
                staff.unavailableDateSet.add(restDk); // fully blocked further out
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
          if (isNight && staff.consecutiveNights > maxConsecutiveNight) {
            warnings.push({ type: 'NIGHT_LIMIT', date: dk, shiftTypeName: shiftType.name, message: `スタッフ${staff.id.slice(0, 6)}: 連続夜勤${staff.consecutiveNights}回`, severity: 'LOW' });
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
  }

  // 36協定: 残業上限に近いスタッフへの配慮を警告として表示
  if (overloadedSet.size > 0) {
    warnings.push({
      type: 'NIGHT_LIMIT',
      date: '',
      shiftTypeName: '残業配慮',
      message: `残業上限に近いスタッフ${overloadedSet.size}名には夜勤の割り当てを抑制しました`,
      severity: 'LOW',
    });
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

  const totalNight = allStaffStates.reduce((acc, s) => acc + s.nightShifts, 0);
  console.log(`[generateShifts] done: totalShifts=${generatedShifts.length} totalNightShifts=${totalNight} (night-after-night rest rule active)`);

  // Save StaffShiftStats (non-fatal)
  try {
    for (const staff of allStaffStates) {
      if (staff.workDays === 0) continue;
      await prisma.staffShiftStats.upsert({
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
  requirements: RequirementRow[],
  dayOfWeek: number,
  shiftTypes: Array<{ id: string }>,
): Map<string, { required: number }> {
  const result = new Map<string, { required: number }>();
  for (const st of shiftTypes) {
    const relevant = requirements.filter(r => r.shiftTypeId === st.id);
    if (relevant.length === 0) continue;
    const specific = relevant.find(r => r.dayOfWeek === dayOfWeek);
    const general = relevant.find(r => r.dayOfWeek === null);
    const req = specific ?? general;
    if (!req) continue;
    result.set(st.id, { required: req.requiredStaff });
  }
  return result;
}
