import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create groups
  const group1 = await prisma.group.upsert({
    where: { id: 'group-1f' },
    update: {},
    create: {
      id: 'group-1f',
      name: '1Fフロア',
      color: '#2563EB',
      description: '1階フロアのスタッフグループ',
      isActive: true,
    },
  });

  const group2 = await prisma.group.upsert({
    where: { id: 'group-2f' },
    update: {},
    create: {
      id: 'group-2f',
      name: '2Fフロア',
      color: '#10B981',
      description: '2階フロアのスタッフグループ',
      isActive: true,
    },
  });

  console.log('Groups created:', group1.name, group2.name);

  const saltRounds = 12;
  const adminHash = await bcrypt.hash('Admin1234!', saltRounds);
  const staffHash = await bcrypt.hash('Staff1234!', saltRounds);

  // Create admin
  const admin = await prisma.user.upsert({
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

  // Create staff members
  const staff1 = await prisma.user.upsert({
    where: { userCode: 'staff001' },
    update: {},
    create: {
      id: 'user-staff1',
      userCode: 'staff001',
      passwordHash: staffHash,
      role: 'GROUP_LEADER',
      lastName: '田中',
      firstName: '花子',
      lastNameKana: 'タナカ',
      firstNameKana: 'ハナコ',
      employmentType: 'FULL_TIME',
      monthlySalary: 220000,
      email: 'tanaka@careshift.jp',
      phone: '090-1234-5678',
      hireDate: new Date('2021-04-01'),
      isActive: true,
    },
  });

  const staff2 = await prisma.user.upsert({
    where: { userCode: 'staff002' },
    update: {},
    create: {
      id: 'user-staff2',
      userCode: 'staff002',
      passwordHash: staffHash,
      role: 'STAFF',
      lastName: '鈴木',
      firstName: '一郎',
      lastNameKana: 'スズキ',
      firstNameKana: 'イチロウ',
      employmentType: 'PART_TIME',
      hourlyWage: 1200,
      email: 'suzuki@careshift.jp',
      phone: '090-2345-6789',
      hireDate: new Date('2022-06-01'),
      isActive: true,
    },
  });

  const staff3 = await prisma.user.upsert({
    where: { userCode: 'staff003' },
    update: {},
    create: {
      id: 'user-staff3',
      userCode: 'staff003',
      passwordHash: staffHash,
      role: 'STAFF',
      lastName: '佐藤',
      firstName: '美咲',
      lastNameKana: 'サトウ',
      firstNameKana: 'ミサキ',
      employmentType: 'PART_TIME',
      hourlyWage: 1100,
      email: 'sato@careshift.jp',
      phone: '090-3456-7890',
      hireDate: new Date('2023-01-15'),
      isActive: true,
    },
  });

  const staff4 = await prisma.user.upsert({
    where: { userCode: 'staff004' },
    update: {},
    create: {
      id: 'user-staff4',
      userCode: 'staff004',
      passwordHash: staffHash,
      role: 'STAFF',
      lastName: '山田',
      firstName: '太一',
      lastNameKana: 'ヤマダ',
      firstNameKana: 'タイチ',
      employmentType: 'FULL_TIME',
      monthlySalary: 210000,
      email: 'yamada@careshift.jp',
      hireDate: new Date('2021-10-01'),
      isActive: true,
    },
  });

  const staff5 = await prisma.user.upsert({
    where: { userCode: 'staff005' },
    update: {},
    create: {
      id: 'user-staff5',
      userCode: 'staff005',
      passwordHash: staffHash,
      role: 'STAFF',
      lastName: '伊藤',
      firstName: '恵子',
      lastNameKana: 'イトウ',
      firstNameKana: 'ケイコ',
      employmentType: 'PART_TIME',
      hourlyWage: 1150,
      email: 'ito@careshift.jp',
      hireDate: new Date('2022-04-01'),
      isActive: true,
    },
  });

  const staff6 = await prisma.user.upsert({
    where: { userCode: 'staff006' },
    update: {},
    create: {
      id: 'user-staff6',
      userCode: 'staff006',
      passwordHash: staffHash,
      role: 'STAFF',
      lastName: '渡辺',
      firstName: '健二',
      lastNameKana: 'ワタナベ',
      firstNameKana: 'ケンジ',
      employmentType: 'FULL_TIME',
      monthlySalary: 215000,
      email: 'watanabe@careshift.jp',
      hireDate: new Date('2022-09-01'),
      isActive: true,
    },
  });

  const staff7 = await prisma.user.upsert({
    where: { userCode: 'staff007' },
    update: {},
    create: {
      id: 'user-staff7',
      userCode: 'staff007',
      passwordHash: staffHash,
      role: 'GROUP_LEADER',
      lastName: '中村',
      firstName: '由美',
      lastNameKana: 'ナカムラ',
      firstNameKana: 'ユミ',
      employmentType: 'FULL_TIME',
      monthlySalary: 230000,
      email: 'nakamura@careshift.jp',
      hireDate: new Date('2020-10-01'),
      isActive: true,
    },
  });

  const staff8 = await prisma.user.upsert({
    where: { userCode: 'staff008' },
    update: {},
    create: {
      id: 'user-staff8',
      userCode: 'staff008',
      passwordHash: staffHash,
      role: 'STAFF',
      lastName: '小林',
      firstName: '翔太',
      lastNameKana: 'コバヤシ',
      firstNameKana: 'ショウタ',
      employmentType: 'PART_TIME',
      hourlyWage: 1100,
      email: 'kobayashi@careshift.jp',
      hireDate: new Date('2023-04-01'),
      isActive: true,
    },
  });

  const staff9 = await prisma.user.upsert({
    where: { userCode: 'staff009' },
    update: {},
    create: {
      id: 'user-staff9',
      userCode: 'staff009',
      passwordHash: staffHash,
      role: 'STAFF',
      lastName: '加藤',
      firstName: 'さくら',
      lastNameKana: 'カトウ',
      firstNameKana: 'サクラ',
      employmentType: 'PART_TIME',
      hourlyWage: 1200,
      email: 'kato@careshift.jp',
      hireDate: new Date('2023-07-01'),
      isActive: true,
    },
  });

  const staff10 = await prisma.user.upsert({
    where: { userCode: 'staff010' },
    update: {},
    create: {
      id: 'user-staff10',
      userCode: 'staff010',
      passwordHash: staffHash,
      role: 'STAFF',
      lastName: '吉田',
      firstName: '誠',
      lastNameKana: 'ヨシダ',
      firstNameKana: 'マコト',
      employmentType: 'CONTRACT',
      hourlyWage: 1300,
      email: 'yoshida@careshift.jp',
      hireDate: new Date('2023-10-01'),
      isActive: true,
    },
  });

  console.log('Users created:', admin.userCode, staff1.userCode, staff2.userCode, staff3.userCode,
    staff4.userCode, staff5.userCode, staff6.userCode, staff7.userCode,
    staff8.userCode, staff9.userCode, staff10.userCode);

  // Assign users to groups
  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: 'user-staff1', groupId: 'group-1f' } },
    update: {},
    create: { userId: 'user-staff1', groupId: 'group-1f', isLeader: true },
  });

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: 'user-staff2', groupId: 'group-1f' } },
    update: {},
    create: { userId: 'user-staff2', groupId: 'group-1f', isLeader: false },
  });

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: 'user-staff3', groupId: 'group-2f' } },
    update: {},
    create: { userId: 'user-staff3', groupId: 'group-2f', isLeader: false },
  });

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: 'user-staff4', groupId: 'group-1f' } },
    update: {},
    create: { userId: 'user-staff4', groupId: 'group-1f', isLeader: false },
  });

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: 'user-staff5', groupId: 'group-1f' } },
    update: {},
    create: { userId: 'user-staff5', groupId: 'group-1f', isLeader: false },
  });

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: 'user-staff6', groupId: 'group-2f' } },
    update: {},
    create: { userId: 'user-staff6', groupId: 'group-2f', isLeader: false },
  });

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: 'user-staff7', groupId: 'group-2f' } },
    update: {},
    create: { userId: 'user-staff7', groupId: 'group-2f', isLeader: true },
  });

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: 'user-staff8', groupId: 'group-2f' } },
    update: {},
    create: { userId: 'user-staff8', groupId: 'group-2f', isLeader: false },
  });

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: 'user-staff9', groupId: 'group-1f' } },
    update: {},
    create: { userId: 'user-staff9', groupId: 'group-1f', isLeader: false },
  });

  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: 'user-staff10', groupId: 'group-2f' } },
    update: {},
    create: { userId: 'user-staff10', groupId: 'group-2f', isLeader: false },
  });

  console.log('Group assignments created');

  // Create default salary items
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

  // Create default shift types
  const shiftTypes = [
    { id: 'shift-type-1', name: '日勤', startTime: '08:00', endTime: '17:00', breakMinutes: 60, color: '#2563EB', isOvernight: false, isActive: true },
    { id: 'shift-type-2', name: '夜勤', startTime: '22:00', endTime: '07:00', breakMinutes: 60, color: '#7C3AED', isOvernight: true, isActive: true },
    { id: 'shift-type-3', name: '早番', startTime: '07:00', endTime: '16:00', breakMinutes: 60, color: '#10B981', isOvernight: false, isActive: true },
    { id: 'shift-type-4', name: '遅番', startTime: '12:00', endTime: '21:00', breakMinutes: 60, color: '#F59E0B', isOvernight: false, isActive: true },
  ];

  for (const st of shiftTypes) {
    await prisma.shiftType.upsert({
      where: { id: st.id },
      update: {},
      create: st,
    });
  }

  console.log('Shift types created');
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
