import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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

  // Reset all group memberships so each staff belongs to exactly one group
  // (removes stale/duplicate memberships from earlier seeds or manual edits that
  //  otherwise cause a staff to be generated in several groups → over-work)
  await prisma.userGroup.deleteMany({});

  // Upsert groups
  const groupIds = GROUPS.map(g => g.id);
  for (const g of GROUPS) {
    await prisma.group.upsert({
      where: { id: g.id },
      update: { name: g.name, color: g.color, description: g.description, isActive: true },
      create: { id: g.id, name: g.name, color: g.color, description: g.description, isActive: true },
    });
  }
  // Remove groups left over from previous seeds so generation only targets these 5
  await prisma.group.deleteMany({ where: { id: { notIn: groupIds } } });
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

    staffIds.push(userId);
  }

  console.log(`Created ${staffIds.length} staff members`);

  // Salary items
  const salaryItems = [
    { name: '基本給', itemType: 'INCOME', calcType: 'FIXED', isDefault: true, sortOrder: 1 },
    { name: '残業手当', itemType: 'INCOME', calcType: 'FORMULA', calcFormula: 'hourlyWage * 1.25 * overtimeHours', isDefault: true, sortOrder: 2 },
    { name: '深夜手当', itemType: 'INCOME', calcType: 'FORMULA', calcFormula: 'hourlyWage * 0.25 * lateNightHours', isDefault: true, sortOrder: 3 },
    { name: '雇用保険', itemType: 'DEDUCTION', calcType: 'FORMULA', calcFormula: 'totalIncome * 0.006', isDefault: true, sortOrder: 4 },
    { name: '社会保険', itemType: 'DEDUCTION', calcType: 'FORMULA', calcFormula: 'totalIncome * 0.1495', isDefault: true, sortOrder: 5 },
    { name: '所得税', itemType: 'DEDUCTION', calcType: 'FORMULA', calcFormula: 'withholdingTax', isDefault: true, sortOrder: 6 },
  ];

  for (const item of salaryItems) {
    await prisma.salaryItem.upsert({
      where: { id: `salary-${item.sortOrder}` },
      update: {},
      create: { id: `salary-${item.sortOrder}`, ...item },
    });
  }
  console.log('Salary items created');

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

  // Per-group ShiftRequirements (全日・単一の必要人数)
  // 通常グループ（10名）: 日勤3 / 早番1 / 遅番1 / 夜勤1 = 6枠/日 → 1人あたり約18日/月
  const regularReq: Record<string, number> = {
    'shift-type-1': 3, // 日勤
    'shift-type-2': 1, // 夜勤
    'shift-type-3': 1, // 早番
    'shift-type-4': 1, // 遅番
  };
  // 夜勤専従グループ（10名）: 夜勤中心
  const nightReq: Record<string, number> = {
    'shift-type-1': 0, // 日勤
    'shift-type-2': 3, // 夜勤
    'shift-type-3': 0, // 早番
    'shift-type-4': 0, // 遅番
  };

  for (const g of GROUPS) {
    const reqSet = g.id === 'group-night' ? nightReq : regularReq;
    for (const [shiftTypeId, requiredStaff] of Object.entries(reqSet)) {
      if (requiredStaff <= 0) continue;
      const reqId = `req-${g.id}-${shiftTypeId}`;
      await prisma.shiftRequirement.upsert({
        where: { id: reqId },
        update: { requiredStaff },
        create: {
          id: reqId,
          shiftTypeId,
          dayOfWeek: null,
          dateType: 'ALL',
          requiredStaff,
          groupId: g.id,
          isActive: true,
        },
      });
    }
  }
  console.log('Per-group shift requirements created');

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
