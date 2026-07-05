import { describe, it, expect } from 'vitest';
import {
  toHankaku, padKana, padNum, padCode, accountTypeCode,
  buildHeader, buildDataRecord, buildTrailer, buildEnd, buildZenginFile, encodeJisX0201,
  type ZenginHeader, type ZenginRecord,
} from './zengin.js';

const header: ZenginHeader = {
  consignorCode: '1234567890',
  consignorName: 'ｶ)ｹｱｼﾌﾄ',
  transferDate: new Date(Date.UTC(2026, 6, 25)),
  bankCode: '0001',
  bankName: 'ﾐｽﾞﾎ',
  branchCode: '001',
  branchName: 'ﾎﾝﾃﾝ',
  accountType: 'ORDINARY',
  accountNumber: '1234567',
};

const record: ZenginRecord = {
  bankCode: '0005',
  bankName: 'ﾐﾂﾋﾞｼUFJ',
  branchCode: '123',
  branchName: 'ｼﾌﾞﾔ',
  accountType: 'ORDINARY',
  accountNumber: '7654321',
  recipientName: 'ﾔﾏﾀﾞ ﾀﾛｳ',
  amount: 250000,
};

describe('全銀協レコード長は120バイト固定', () => {
  it('ヘッダー', () => expect(buildHeader(header).length).toBe(120));
  it('データ', () => expect(buildDataRecord(record).length).toBe(120));
  it('トレーラー', () => expect(buildTrailer(1, 250000).length).toBe(120));
  it('エンド', () => expect(buildEnd().length).toBe(120));
});

describe('桁揃え', () => {
  it('padNum は右詰めゼロ埋め', () => {
    expect(padNum(250000, 10)).toBe('0000250000');
    expect(padNum(0, 6)).toBe('000000');
  });
  it('padNum は負数を0として扱う', () => {
    expect(padNum(-5, 4)).toBe('0000');
  });
  it('padCode は数字以外を除去して右詰め', () => {
    expect(padCode('001', 4)).toBe('0001');
    expect(padCode('ﾃﾝ12', 3)).toBe('012');
  });
  it('padKana は左詰めスペース埋め', () => {
    expect(padKana('ｱｲｳ', 5)).toBe('ｱｲｳ  ');
  });
});

describe('toHankaku', () => {
  it('全角カタカナを半角に変換', () => {
    expect(toHankaku('ヤマダ')).toBe('ﾔﾏﾀﾞ');
  });
  it('ひらがなを半角カナに変換', () => {
    expect(toHankaku('やまだ')).toBe('ﾔﾏﾀﾞ');
  });
  it('小文字英字は大文字に', () => {
    expect(toHankaku('abc')).toBe('ABC');
  });
  it('使用不可文字はスペースに', () => {
    expect(toHankaku('田中')).toBe('  ');
  });
});

describe('accountTypeCode', () => {
  it('普通=1 当座=2', () => {
    expect(accountTypeCode('ORDINARY')).toBe('1');
    expect(accountTypeCode('CHECKING')).toBe('2');
  });
});

describe('buildZenginFile', () => {
  it('合計金額・件数を集計する', () => {
    const file = buildZenginFile(header, [record, { ...record, amount: 100000 }]);
    expect(file.count).toBe(2);
    expect(file.totalAmount).toBe(350000);
  });
  it('4種のレコードを含む（ヘッダー・データ×n・トレーラー・エンド）', () => {
    const file = buildZenginFile(header, [record]);
    const lines = file.content.trimEnd().split('\r\n');
    expect(lines.length).toBe(4);
    expect(lines[0][0]).toBe('1');
    expect(lines[1][0]).toBe('2');
    expect(lines[2][0]).toBe('8');
    expect(lines[3][0]).toBe('9');
  });
});

describe('encodeJisX0201', () => {
  it('半角カナブロック(U+FF61–U+FF9F)を 0xA1–0xDF に符号化', () => {
    expect(encodeJisX0201('｡')[0]).toBe(0xA1); // ブロック先頭 U+FF61
    expect(encodeJisX0201('ﾟ')[0]).toBe(0xDF); // ブロック末尾 U+FF9F
    expect(encodeJisX0201('ｱ')[0]).toBe(0xB1); // U+FF71
    expect(encodeJisX0201('ﾝ')[0]).toBe(0xDD); // U+FF9D
  });
  it('ASCII はそのまま', () => {
    expect(encodeJisX0201('A')[0]).toBe(0x41);
  });
  it('各データレコードは120バイトで符号化される', () => {
    const buf = encodeJisX0201(buildDataRecord(record));
    expect(buf.length).toBe(120);
  });
});
