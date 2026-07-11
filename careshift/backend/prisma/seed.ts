import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ---- Phase A-1: テナント3階層の既定値(設計書§1.1) ----
// 固定IDは backfill(prisma/backfill/a1-tenant-backfill.ts)・schema の
// @default("tenant-default") と共有している。変更する場合は3箇所同時に。
const TENANT_ID = 'tenant-default';
const OFFICE_ID = 'office-default';

// 指定サービス種別マスタ(設計書§2.2。TOKUYO等5種)
const SERVICE_TYPES = [
  { id: 'svc-tokuyo', code: 'TOKUYO', name: '特別養護老人ホーム', insuranceKind: 'KAIGO' },
  { id: 'svc-roken', code: 'ROKEN', name: '介護老人保健施設', insuranceKind: 'KAIGO' },
  { id: 'svc-gh', code: 'GH', name: '認知症対応型共同生活介護(グループホーム)', insuranceKind: 'KAIGO' },
  { id: 'svc-daycare', code: 'DAYCARE', name: '通所介護(デイサービス)', insuranceKind: 'KAIGO' },
  { id: 'svc-yuryo', code: 'YURYO', name: '有料老人ホーム(特定施設)', insuranceKind: 'KAIGO' },
];

const GROUPS = [
  { id: 'group-1fa', name: '1F Aチーム', color: '#2563EB', description: '1階Aチームのスタッフグループ' },
  { id: 'group-1fb', name: '1F Bチーム', color: '#10B981', description: '1階Bチームのスタッフグループ' },
  { id: 'group-2fa', name: '2F Aチーム', color: '#F59E0B', description: '2階Aチームのスタッフグループ' },
  { id: 'group-2fb', name: '2F Bチーム', color: '#8B5CF6', description: '2階Bチームのスタッフグループ' },
  { id: 'group-night', name: '夜勤専従', color: '#EF4444', description: '夜勤専従スタッフグループ' },
];

// 50 staff: 10 per group
// Within each group: index 0=LEADER, 1-2=SENIOR, 3-7=NORMAL, 8-9=TRAINEE
// Employment: 0-5=FULL_TIME, 6-8=PART_TIME, 9=CONTRACT
const LAST_NAMES = [
  // group-1fa (001-010)
  '田中', '鈴木', '佐藤', '山田', '伊藤', '渡辺', '中村', '小林', '加藤', '吉田',
  // group-1fb (011-020)
  '山本', '齋藤', '松本', '井上', '木村', '林', '清水', '山口', '松田', '池田',
  // group-2fa (021-030)
  '橋本', '阿部', '石川', '前田', '小川', '岡田', '後藤', '長谷川', '村上', '近藤',
  // group-2fb (031-040)
  '石田', '西村', '藤田', '坂本', '原', '野口', '竹内', '宮崎', '福田', '菅原',
  // group-night (041-050)
  '上田', '中島', '藤原', '小野', '田村', '岩田', '高野', '土屋', '成田', '川口',
];

const FIRST_NAMES = [
  // group-1fa
  '花子', '一郎', '美咲', '太一', '恵子', '健二', '由美', '翔太', 'さくら', '誠',
  // group-1fb
  '陽子', '浩二', '奈緒', '大輔', 'みどり', '隆', '愛', '拓海', 'ゆき', '宏',
  // group-2fa
  '幸子', '晴彦', '麻衣', '竜也', '千夏', '勝', '恵', '祐介', '真里', '直樹',
  // group-2fb
  '玲子', '博之', '美紀', '和也', '友子', '雄太', '七海', '剛', 'あかね', '貴志',
  // group-night
  '尚子', '達也', '理恵', '信一', '葉月', '洋介', '彩', '俊哉', '春菜', '勇気',
];

const KANA_LAST = [
  'タナカ', 'スズキ', 'サトウ', 'ヤマダ', 'イトウ', 'ワタナベ', 'ナカムラ', 'コバヤシ', 'カトウ', 'ヨシダ',
  'ヤマモト', 'サイトウ', 'マツモト', 'イノウエ', 'キムラ', 'ハヤシ', 'シミズ', 'ヤマグチ', 'マツダ', 'イケダ',
  'ハシモト', 'アベ', 'イシカワ', 'マエダ', 'オガワ', 'オカダ', 'ゴトウ', 'ハセガワ', 'ムラカミ', 'コンドウ',
  'イシダ', 'ニシムラ', 'フジタ', 'サカモト', 'ハラ', 'ノグチ', 'タケウチ', 'ミヤザキ', 'フクダ', 'スガワラ',
  'ウエダ', 'ナカジマ', 'フジワラ', 'オノ', 'タムラ', 'イワタ', 'タカノ', 'ツチヤ', 'ナリタ', 'カワグチ',
];

const KANA_FIRST = [
  'ハナコ', 'イチロウ', 'ミサキ', 'タイチ', 'ケイコ', 'ケンジ', 'ユミ', 'ショウタ', 'サクラ', 'マコト',
  'ヨウコ', 'コウジ', 'ナオ', 'ダイスケ', 'ミドリ', 'タカシ', 'アイ', 'タクミ', 'ユキ', 'ヒロシ',
  'サチコ', 'ハルヒコ', 'マイ', 'タツヤ', 'チナツ', 'マサル', 'メグミ', 'ユウスケ', 'マリ', 'ナオキ',
  'レイコ', 'ヒロユキ', 'ミキ', 'カズヤ', 'トモコ', 'ユウタ', 'ナナミ', 'ツヨシ', 'アカネ', 'タカシ',
  'ナオコ', 'タツヤ', 'リエ', 'シンイチ', 'ハヅキ', 'ヨウスケ', 'アヤ', 'トシヤ', 'ハルナ', 'ユウキ',
];

const HIRE_DATES = [
  new Date('2020-04-01'), new Date('2021-04-01'), new Date('2021-10-01'),
  new Date('2022-04-01'), new Date('2022-06-01'), new Date('2022-09-01'),
  new Date('2023-01-15'), new Date('2023-04-01'), new Date('2023-07-01'), new Date('2023-10-01'),
];

function getSkillLevel(indexInGroup: number): string {
  if (indexInGroup === 0) return 'LEADER';
  if (indexInGroup <= 2) return 'SENIOR';
  if (indexInGroup <= 7) return 'NORMAL';
  return 'TRAINEE';
}

function getRole(indexInGroup: number): string {
  if (indexInGroup === 0) return 'GROUP_LEADER';
  return 'STAFF';
}

function getEmploymentType(indexInGroup: number): string {
  if (indexInGroup <= 5) return 'FULL_TIME';
  if (indexInGroup <= 8) return 'PART_TIME';
  return 'CONTRACT';
}

async function main() {
  console.log('Seeding database...');

  // ---- Phase A-1: Tenant / ServiceType / Office(旧FACILITY_NAME) ----
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: { name: '既定法人', isActive: true },
    create: { id: TENANT_ID, name: '既定法人', plan: 'STANDARD', isActive: true },
  });
  for (const st of SERVICE_TYPES) {
    await prisma.serviceType.upsert({
      where: { code: st.code },
      update: { name: st.name, insuranceKind: st.insuranceKind },
      create: st,
    });
  }
  const officeName = process.env.FACILITY_NAME || '既定事業所';
  await prisma.office.upsert({
    where: { id: OFFICE_ID },
    update: { name: officeName, isActive: true },
    create: {
      id: OFFICE_ID,
      tenantId: TENANT_ID,
      name: officeName,
      serviceTypeId: 'svc-tokuyo',
      capacity: 50,
      avgUsers: 45,
      fullTimeWeeklyHours: 40,
    },
  });
  console.log(`Tenant/Office created: 既定法人 / ${officeName} (ServiceType x${SERVICE_TYPES.length})`);

  // Reset all group memberships so each staff belongs to exactly one group
  // (removes stale/duplicate memberships from earlier seeds or manual edits that
  //  otherwise cause a staff to be generated in several groups → over-work)
  await prisma.userGroup.deleteMany({});

  // Upsert groups
  const groupIds = GROUPS.map(g => g.id);
  for (const g of GROUPS) {
    await prisma.unit.upsert({
      where: { id: g.id },
      update: { name: g.name, color: g.color, description: g.description, isActive: true, officeId: OFFICE_ID },
      create: { id: g.id, name: g.name, color: g.color, description: g.description, isActive: true, officeId: OFFICE_ID },
    });
  }
  // Remove groups left over from previous seeds so generation only targets these 5
  await prisma.unit.deleteMany({ where: { id: { notIn: groupIds } } });
  console.log('Groups created:', GROUPS.map(g => g.name).join(', '));

  const saltRounds = 12;
  const adminHash = await bcrypt.hash('Admin1234!', saltRounds);
  const staffHash = await bcrypt.hash('Staff1234!', saltRounds);

  // Create admin
  await prisma.user.upsert({
    where: { userCode: 'admin' },
    update: {},
    create: {
      id: 'user-admin',
      userCode: 'admin',
      passwordHash: adminHash,
      role: 'ADMIN',
      lastName: '管理',
      firstName: '太郎',
      lastNameKana: 'カンリ',
      firstNameKana: 'タロウ',
      employmentType: 'FULL_TIME',
      monthlySalary: 300000,
      email: 'admin@careshift.jp',
      hireDate: new Date('2020-04-01'),
      isActive: true,
    },
  });
  await prisma.staffAssignment.upsert({
    where: { userId_officeId: { userId: 'user-admin', officeId: OFFICE_ID } },
    update: {},
    create: { userId: 'user-admin', officeId: OFFICE_ID, jobCategory: 'MANAGER', employmentType: 'FULL_TIME', weeklyContractHours: 40 },
  });
  console.log('Admin created: admin');

  // Create 50 staff (10 per group)
  const staffIds: string[] = [];
  for (let i = 0; i < 50; i++) {
    const globalIdx = i + 1;
    const groupIdx = Math.floor(i / 10);
    const indexInGroup = i % 10;
    const group = GROUPS[groupIdx];
    const userCode = `staff${String(globalIdx).padStart(3, '0')}`;
    const userId = `user-staff${globalIdx}`;
    const empType = getEmploymentType(indexInGroup);
    const isNightGroup = group.id === 'group-night';

    const userData = {
      userCode,
      passwordHash: staffHash,
      role: getRole(indexInGroup),
      lastName: LAST_NAMES[i],
      firstName: FIRST_NAMES[i],
      lastNameKana: KANA_LAST[i],
      firstNameKana: KANA_FIRST[i],
      employmentType: empType,
      monthlySalary: empType === 'FULL_TIME'
        ? (indexInGroup === 0 ? 230000 : indexInGroup <= 2 ? 220000 : 210000)
        : null,
      hourlyWage: empType !== 'FULL_TIME'
        ? (indexInGroup === 9 ? 1300 : indexInGroup === 8 ? 1100 : 1200)
        : null,
      email: `${userCode}@careshift.jp`,
      phone: `090-${String(1000 + globalIdx).padStart(4, '0')}-${String(5000 + globalIdx).padStart(4, '0')}`,
      hireDate: HIRE_DATES[indexInGroup],
      isActive: true,
    };

    await prisma.user.upsert({
      where: { userCode },
      update: {},
      create: { id: userId, ...userData },
    });

    // Group membership
    await prisma.userGroup.upsert({
      where: { userId_groupId: { userId, groupId: group.id } },
      update: {},
      create: { userId, groupId: group.id, isLeader: indexInGroup === 0 },
    });

    // Staff constraints
    const skillLevel = getSkillLevel(indexInGroup);
    const isTrainee = skillLevel === 'TRAINEE';
    const isPartOrContract = empType !== 'FULL_TIME';
    const canWorkNight = isNightGroup ? true : !isPartOrContract;
    const maxWorkDays = indexInGroup === 9 ? 15 : null; // CONTRACT = 15 days max

    await prisma.staffConstraint.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        skillLevel,
        canWorkNight,
        requiresPairing: isTrainee,
        maxWorkDaysPerMonth: maxWorkDays,
        maxNightShifts: isNightGroup ? 16 : (canWorkNight ? 8 : 0),
      },
    });

    // 所属(StaffAssignment) — 既定事業所へ配属。職種は仮置きCARE_WORKER(A-1)。
    // 常勤区分: 月給制=FULL_TIME / 時給制=PART_TIME(バックフィルと同じ規則)
    const assignEmployment = empType === 'FULL_TIME' ? 'FULL_TIME' : 'PART_TIME';
    await prisma.staffAssignment.upsert({
      where: { userId_officeId: { userId, officeId: OFFICE_ID } },
      update: { employmentType: assignEmployment, weeklyContractHours: assignEmployment === 'FULL_TIME' ? 40 : 24 },
      create: {
        userId,
        officeId: OFFICE_ID,
        jobCategory: 'CARE_WORKER',
        employmentType: assignEmployment,
        weeklyContractHours: assignEmployment === 'FULL_TIME' ? 40 : 24,
      },
    });

    staffIds.push(userId);
  }

  console.log(`Created ${staffIds.length} staff members (+StaffAssignment)`);

  // Salary items — 11 default items (Phase 3 spec)
  // calcType: AUTO (engine-calculated via `code`), MANUAL (admin input), FIXED, HOURLY
  // itemType: INCOME (支給) / DEDUCTION (控除)
  const salaryItems = [
    // 支給項目
    { code: 'BASIC', name: '基本給', itemType: 'INCOME', calcType: 'AUTO', sortOrder: 1 },
    { code: 'OVERTIME', name: '残業手当', itemType: 'INCOME', calcType: 'AUTO', sortOrder: 2 },
    { code: 'LATE_NIGHT', name: '深夜手当', itemType: 'INCOME', calcType: 'AUTO', sortOrder: 3 },
    { code: 'HOLIDAY', name: '休日出勤手当', itemType: 'INCOME', calcType: 'AUTO', sortOrder: 4 },
    // 夜勤手当: 1回の夜勤につき定額（calcFormula に金額を保持＝設定変更可）
    { code: 'NIGHT_ALLOWANCE', name: '夜勤手当', itemType: 'INCOME', calcType: 'AUTO', calcFormula: '8000', sortOrder: 5 },
    { code: 'COMMUTE', name: '通勤手当', itemType: 'INCOME', calcType: 'MANUAL', sortOrder: 6 },
    { code: 'OTHER_ALLOWANCE', name: 'その他手当', itemType: 'INCOME', calcType: 'MANUAL', sortOrder: 7 },
    // 控除項目
    { code: 'HEALTH_INSURANCE', name: '健康保険料', itemType: 'DEDUCTION', calcType: 'MANUAL', sortOrder: 8 },
    { code: 'PENSION', name: '厚生年金', itemType: 'DEDUCTION', calcType: 'MANUAL', sortOrder: 9 },
    // 雇用保険料は総支給額 × 0.006（calcFormula に率を保持＝設定変更可）
    { code: 'EMPLOYMENT_INSURANCE', name: '雇用保険料', itemType: 'DEDUCTION', calcType: 'AUTO', calcFormula: '0.006', sortOrder: 10 },
    { code: 'INCOME_TAX', name: '所得税', itemType: 'DEDUCTION', calcType: 'MANUAL', sortOrder: 11 },
    { code: 'RESIDENT_TAX', name: '住民税', itemType: 'DEDUCTION', calcType: 'MANUAL', sortOrder: 12 },
  ];

  // Clear legacy salary items from earlier seeds, then create the canonical set
  await prisma.salaryItem.deleteMany({});
  for (const item of salaryItems) {
    await prisma.salaryItem.create({
      data: { id: `salary-${item.sortOrder}`, isDefault: true, isActive: true, ...item },
    });
  }
  console.log('Salary items created (11 defaults)');

  // Shift types
  const shiftTypes = [
    { id: 'shift-type-1', name: '日勤', startTime: '08:00', endTime: '17:00', breakMinutes: 60, color: '#2563EB', isOvernight: false, isNightShift: false, isActive: true },
    { id: 'shift-type-2', name: '夜勤', startTime: '22:00', endTime: '07:00', breakMinutes: 60, color: '#7C3AED', isOvernight: true, isNightShift: true, isActive: true },
    { id: 'shift-type-3', name: '早番', startTime: '07:00', endTime: '16:00', breakMinutes: 60, color: '#10B981', isOvernight: false, isNightShift: false, isActive: true },
    { id: 'shift-type-4', name: '遅番', startTime: '12:00', endTime: '21:00', breakMinutes: 60, color: '#F59E0B', isOvernight: false, isNightShift: false, isActive: true },
  ];

  for (const st of shiftTypes) {
    await prisma.shiftType.upsert({
      where: { id: st.id },
      update: { isNightShift: st.isNightShift },
      create: st,
    });
  }
  console.log('Shift types created');

  // Default GroupShiftConfig for each group (requires migration)
  try {
    for (const g of GROUPS) {
      await (prisma as unknown as { groupShiftConfig: { upsert: (args: object) => Promise<unknown> } }).groupShiftConfig.upsert({
        where: { groupId: g.id },
        update: {},
        create: {
          groupId: g.id,
          enableFairDistribution: true,
          fairDistributionTarget: g.id === 'group-night' ? 'NIGHT' : 'ALL',
          // 夜勤専従グループは夜勤上限を引き上げる
          maxNightPerMonth: g.id === 'group-night' ? 20 : null,
        },
      });
    }
    console.log('Group shift configs created');
  } catch {
    console.log('Group shift configs skipped (run migration first)');
  }

  // Default ShiftRules
  const shiftRules = [
    { ruleType: 'MAX_CONSECUTIVE_WORK_DAYS', value: 5, description: '最大連続勤務日数', isActive: true },
    { ruleType: 'MAX_NIGHT_SHIFTS_PER_MONTH', value: 8, description: '月最大夜勤回数', isActive: true },
    { ruleType: 'MAX_CONSECUTIVE_NIGHT', value: 2, description: '最大連続夜勤回数', isActive: true },
    { ruleType: 'MIN_SKILLED_PER_SHIFT', value: 1, description: '1シフトあたり最低スキル者数', isActive: true },
    { ruleType: 'MIN_REST_AFTER_NIGHT', value: 16, description: '夜勤後の最低休息時間（時間）', isActive: true },
    { ruleType: 'MIN_WORK_DAYS_PER_MONTH', value: 15, description: '月最低勤務日数（目標）', isActive: true },
  ];
  for (const rule of shiftRules) {
    await prisma.shiftRule.upsert({
      where: { ruleType: rule.ruleType },
      update: {},
      create: rule,
    });
  }
  console.log('Shift rules created');

  // ShiftRequirements (全日・単一の必要人数)
  // Reset first so stale per-group rows from earlier seeds don't override the
  // global defaults edited in the シフト設定 screen.
  await prisma.shiftRequirement.deleteMany({});

  // Global defaults (groupId=null) — これが「シフト設定」画面の数字。
  // 通常グループはこの数字を使う（日勤3 / 夜勤1 / 早番1 / 遅番1 = 6枠/日 → 1人約18日/月）。
  const globalReq: Record<string, number> = {
    'shift-type-1': 3, // 日勤
    'shift-type-2': 1, // 夜勤
    'shift-type-3': 1, // 早番
    'shift-type-4': 1, // 遅番
  };
  for (const [shiftTypeId, requiredStaff] of Object.entries(globalReq)) {
    if (requiredStaff <= 0) continue;
    await prisma.shiftRequirement.create({
      data: { shiftTypeId, dayOfWeek: null, dateType: 'ALL', requiredStaff, groupId: null, isActive: true },
    });
  }

  // 夜勤専従グループのみ個別上書き（夜勤中心）
  const nightGroupReq: Record<string, number> = { 'shift-type-2': 3 };
  for (const [shiftTypeId, requiredStaff] of Object.entries(nightGroupReq)) {
    if (requiredStaff <= 0) continue;
    await prisma.shiftRequirement.create({
      data: { shiftTypeId, dayOfWeek: null, dateType: 'ALL', requiredStaff, groupId: 'group-night', isActive: true },
    });
  }
  console.log('Shift requirements created (global defaults + night-group override)');

  // 36協定 残業上限のデフォルト設定（Phase 5）
  try {
    const existing = await (prisma as unknown as { overtimeLimitConfig: { findFirst: () => Promise<unknown> } }).overtimeLimitConfig.findFirst();
    if (!existing) {
      await (prisma as unknown as { overtimeLimitConfig: { create: (a: object) => Promise<unknown> } }).overtimeLimitConfig.create({
        data: { monthlyLimitHours: 45, yearlyLimitHours: 360, specialMonthlyLimit: 100, specialYearlyLimit: 720, warningThresholdRate: 0.8 },
      });
      console.log('Overtime limit config created');
    }
  } catch {
    console.log('Overtime config skipped (run migration first)');
  }

  // 資格・研修マスタのデフォルト（Phase 6）
  try {
    const qp = prisma as unknown as {
      qualification: { findFirst: () => Promise<unknown>; createMany: (a: object) => Promise<unknown> };
    };
    const existing = await qp.qualification.findFirst();
    if (!existing) {
      await qp.qualification.createMany({
        data: [
          { name: '介護福祉士', category: 'QUALIFICATION', hasExpiry: false, validMonths: null },
          { name: '初任者研修', category: 'QUALIFICATION', hasExpiry: false, validMonths: null },
          { name: '実務者研修', category: 'QUALIFICATION', hasExpiry: false, validMonths: null },
          { name: '普通自動車運転免許', category: 'QUALIFICATION', hasExpiry: true, validMonths: null },
          { name: '認知症介護基礎研修', category: 'TRAINING', hasExpiry: false, validMonths: null },
          { name: '感染症対策研修', category: 'TRAINING', hasExpiry: true, validMonths: 12 },
          { name: '虐待防止研修', category: 'TRAINING', hasExpiry: true, validMonths: 12 },
          { name: '身体拘束適正化研修', category: 'TRAINING', hasExpiry: true, validMonths: 12 },
        ],
      });
      console.log('Qualification masters created (8 defaults)');
    }
  } catch {
    console.log('Qualification masters skipped (run migration first)');
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
