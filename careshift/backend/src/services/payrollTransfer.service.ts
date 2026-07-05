import { PrismaClient } from '@prisma/client';
import { buildZenginFile, type ZenginHeader, type ZenginRecord } from './zengin.js';

const prisma = new PrismaClient();

export interface ConsignorInfo {
  consignorCode: string;
  consignorName: string;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: string;
  accountNumber: string;
}

export interface TransferPreviewRow {
  userId: string;
  name: string;
  amount: number;
  hasAccount: boolean;
  bankName?: string;
  branchName?: string;
  accountNumber?: string;
}

export interface TransferPreview {
  rows: TransferPreviewRow[]; // 口座あり（振込対象）
  missing: TransferPreviewRow[]; // 口座未登録（除外）
  totalCount: number;
  totalAmount: number;
}

/**
 * 指定年月の確定済み給与（status=CONFIRMED, netPay>0）を集計し、
 * 振込対象（口座登録済み）と除外対象（口座未登録）に分けて返す。
 */
export async function buildTransferPreview(year: number, month: number): Promise<TransferPreview> {
  const payrolls = await prisma.payroll.findMany({
    where: { year, month, status: 'CONFIRMED' },
  });
  const userIds = payrolls.map(p => p.userId);
  const [users, accounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, lastName: true, firstName: true },
    }),
    prisma.staffBankAccount.findMany({ where: { userId: { in: userIds } } }),
  ]);
  const userMap = new Map(users.map(u => [u.id, `${u.lastName} ${u.firstName}`]));
  const acctMap = new Map(accounts.map(a => [a.userId, a]));

  const rows: TransferPreviewRow[] = [];
  const missing: TransferPreviewRow[] = [];
  for (const p of payrolls) {
    const amount = Math.floor(Number(p.netPay));
    if (amount <= 0) continue;
    const acct = acctMap.get(p.userId);
    const base = { userId: p.userId, name: userMap.get(p.userId) ?? '', amount };
    if (acct) {
      rows.push({ ...base, hasAccount: true, bankName: acct.bankName, branchName: acct.branchName, accountNumber: acct.accountNumber });
    } else {
      missing.push({ ...base, hasAccount: false });
    }
  }
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  return { rows, missing, totalCount: rows.length, totalAmount };
}

export interface GenerateResult {
  batchId: string;
  content: string;
  count: number;
  totalAmount: number;
  missingCount: number;
  fileName: string;
}

/**
 * 全銀協テキストを生成し、バッチ履歴として保存する。
 * 口座未登録者は振込対象から除外し missingCount として記録する。
 */
export async function generateTransferBatch(
  year: number,
  month: number,
  transferDate: Date,
  consignor: ConsignorInfo,
  createdBy: string,
): Promise<GenerateResult> {
  const preview = await buildTransferPreview(year, month);

  const accounts = await prisma.staffBankAccount.findMany({
    where: { userId: { in: preview.rows.map(r => r.userId) } },
  });
  const acctMap = new Map(accounts.map(a => [a.userId, a]));

  const records: ZenginRecord[] = preview.rows.map(r => {
    const a = acctMap.get(r.userId)!;
    return {
      bankCode: a.bankCode,
      bankName: a.bankName,
      branchCode: a.branchCode,
      branchName: a.branchName,
      accountType: a.accountType,
      accountNumber: a.accountNumber,
      recipientName: a.accountHolder,
      amount: r.amount,
    };
  });

  const header: ZenginHeader = {
    consignorCode: consignor.consignorCode,
    consignorName: consignor.consignorName,
    transferDate,
    bankCode: consignor.bankCode,
    bankName: consignor.bankName,
    branchCode: consignor.branchCode,
    branchName: consignor.branchName,
    accountType: consignor.accountType,
    accountNumber: consignor.accountNumber,
  };
  const file = buildZenginFile(header, records);
  const fileName = `zengin_${year}${String(month).padStart(2, '0')}.txt`;

  const batch = await prisma.payrollTransferBatch.create({
    data: {
      year, month, transferDate,
      totalCount: file.count,
      totalAmount: file.totalAmount,
      status: 'GENERATED',
      fileName,
      content: file.content,
      missingCount: preview.missing.length,
      createdBy,
    },
  });

  return {
    batchId: batch.id,
    content: file.content,
    count: file.count,
    totalAmount: file.totalAmount,
    missingCount: preview.missing.length,
    fileName,
  };
}
