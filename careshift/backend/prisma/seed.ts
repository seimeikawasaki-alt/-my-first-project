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

  console.log('Users created:', admin.userCode, staff1.userCode, staff2.userCode, staff3.userCode);

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
