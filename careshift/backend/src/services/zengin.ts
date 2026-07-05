/**
 * 全銀協フォーマット（総合振込・120バイト固定長）の生成ユーティリティ。
 *
 * ⚠️ 重要: これは「目安」の実装です。金融機関ごとに桁数・項目・使用可能文字・
 * 改行コード・文字コードの細部が異なる場合があります。実際の振込に使用する前に、
 * 必ず取引金融機関の最新の仕様書と照合してください。
 *
 * 文字コードについて:
 * 全銀協フォーマットで使用できる文字は「半角カナ・半角英数・一部記号」に限られ、
 * これらはすべて JIS X 0201（1文字=1バイト）に収まります。そのため外部ライブラリ
 * なしで単バイト列（＝Shift-JIS 互換の下位互換部分）に符号化できます。
 */

// 種別コード: 21 = 総合振込
export const RECORD_TYPE_SOHGO = '21';

export type AccountType = 'ORDINARY' | 'CHECKING';
/** 預金種目コード: 1=普通, 2=当座 */
export function accountTypeCode(t: AccountType | string): string {
  return t === 'CHECKING' ? '2' : '1';
}

// ---- 文字正規化 -----------------------------------------------------------

// 全角カタカナ → 半角カタカナ変換表（濁点・半濁点は分解）
const KANA_MAP: Record<string, string> = {
  'ガ': 'ｶﾞ', 'ギ': 'ｷﾞ', 'グ': 'ｸﾞ', 'ゲ': 'ｹﾞ', 'ゴ': 'ｺﾞ',
  'ザ': 'ｻﾞ', 'ジ': 'ｼﾞ', 'ズ': 'ｽﾞ', 'ゼ': 'ｾﾞ', 'ゾ': 'ｿﾞ',
  'ダ': 'ﾀﾞ', 'ヂ': 'ﾁﾞ', 'ヅ': 'ﾂﾞ', 'デ': 'ﾃﾞ', 'ド': 'ﾄﾞ',
  'バ': 'ﾊﾞ', 'ビ': 'ﾋﾞ', 'ブ': 'ﾌﾞ', 'ベ': 'ﾍﾞ', 'ボ': 'ﾎﾞ',
  'パ': 'ﾊﾟ', 'ピ': 'ﾋﾟ', 'プ': 'ﾌﾟ', 'ペ': 'ﾍﾟ', 'ポ': 'ﾎﾟ',
  'ヴ': 'ｳﾞ',
  'ア': 'ｱ', 'イ': 'ｲ', 'ウ': 'ｳ', 'エ': 'ｴ', 'オ': 'ｵ',
  'カ': 'ｶ', 'キ': 'ｷ', 'ク': 'ｸ', 'ケ': 'ｹ', 'コ': 'ｺ',
  'サ': 'ｻ', 'シ': 'ｼ', 'ス': 'ｽ', 'セ': 'ｾ', 'ソ': 'ｿ',
  'タ': 'ﾀ', 'チ': 'ﾁ', 'ツ': 'ﾂ', 'テ': 'ﾃ', 'ト': 'ﾄ',
  'ナ': 'ﾅ', 'ニ': 'ﾆ', 'ヌ': 'ﾇ', 'ネ': 'ﾈ', 'ノ': 'ﾉ',
  'ハ': 'ﾊ', 'ヒ': 'ﾋ', 'フ': 'ﾌ', 'ヘ': 'ﾍ', 'ホ': 'ﾎ',
  'マ': 'ﾏ', 'ミ': 'ﾐ', 'ム': 'ﾑ', 'メ': 'ﾒ', 'モ': 'ﾓ',
  'ヤ': 'ﾔ', 'ユ': 'ﾕ', 'ヨ': 'ﾖ',
  'ラ': 'ﾗ', 'リ': 'ﾘ', 'ル': 'ﾙ', 'レ': 'ﾚ', 'ロ': 'ﾛ',
  'ワ': 'ﾜ', 'ヲ': 'ｦ', 'ン': 'ﾝ',
  'ァ': 'ｱ', 'ィ': 'ｲ', 'ゥ': 'ｳ', 'ェ': 'ｴ', 'ォ': 'ｵ',
  'ッ': 'ﾂ', 'ャ': 'ﾔ', 'ュ': 'ﾕ', 'ョ': 'ﾖ',
  'ー': 'ｰ', '・': '･', '　': ' ',
};

/**
 * 入力文字列を全銀協で使用可能な半角文字（半角カナ・半角英大文字・数字・一部記号）に
 * 正規化する。小文字は大文字へ、全角英数は半角へ、使用不可文字はスペースへ。
 */
export function toHankaku(input: string): string {
  let s = input ?? '';
  // 全角カタカナ・ひらがな → 半角カナ
  s = s.replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)); // ひらがな→カタカナ
  let out = '';
  for (const ch of s) {
    if (KANA_MAP[ch]) { out += KANA_MAP[ch]; continue; }
    // 全角英数記号 → 半角
    const code = ch.charCodeAt(0);
    if (code >= 0xFF01 && code <= 0xFF5E) { out += String.fromCharCode(code - 0xFEE0); continue; }
    out += ch;
  }
  // 小文字→大文字、使用可能文字以外はスペース
  out = out.toUpperCase();
  out = out.replace(/[^0-9A-Z｡-ﾟ ().\-/]/g, ' ');
  return out;
}

// ---- 桁揃え ---------------------------------------------------------------

/** 半角カナは1文字1バイトなので、文字数=バイト数として左詰めスペース埋め。 */
export function padKana(input: string, len: number): string {
  const s = toHankaku(input);
  if (s.length >= len) return s.slice(0, len);
  return s + ' '.repeat(len - s.length);
}

/** 数値を右詰めゼロ埋め。負数・小数は不可（円単位の整数を想定）。 */
export function padNum(value: number | string, len: number): string {
  const n = typeof value === 'number' ? Math.floor(value) : parseInt(value, 10) || 0;
  const s = Math.max(0, n).toString();
  if (s.length >= len) return s.slice(-len);
  return '0'.repeat(len - s.length) + s;
}

/** 文字列を右詰めゼロ埋め（コード類）。 */
export function padCode(value: string, len: number): string {
  const s = (value ?? '').replace(/[^0-9]/g, '');
  if (s.length >= len) return s.slice(-len);
  return '0'.repeat(len - s.length) + s;
}

// ---- レコード生成 ---------------------------------------------------------

export interface ZenginHeader {
  consignorCode: string; // 委託者コード（10桁）
  consignorName: string; // 委託者名（40桁・半角カナ）
  transferDate: Date; // 取組日（MMDD）
  bankCode: string; // 仕向金融機関番号（4桁）
  bankName: string; // 仕向金融機関名（15桁）
  branchCode: string; // 仕向支店番号（3桁）
  branchName: string; // 仕向支店名（15桁）
  accountType: AccountType | string;
  accountNumber: string; // 口座番号（7桁）
}

export interface ZenginRecord {
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: AccountType | string;
  accountNumber: string;
  recipientName: string; // 受取人名（30桁・半角カナ）
  amount: number; // 振込金額（円）
  customerCode?: string; // 顧客コード（社員番号等・任意）
}

function mmdd(d: Date): string {
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return m + day;
}

/** ヘッダーレコード（120バイト）。 */
export function buildHeader(h: ZenginHeader): string {
  return (
    '1' + // データ区分
    RECORD_TYPE_SOHGO + // 種別コード
    '0' + // コード区分（0=JIS）
    padCode(h.consignorCode, 10) +
    padKana(h.consignorName, 40) +
    mmdd(h.transferDate) +
    padCode(h.bankCode, 4) +
    padKana(h.bankName, 15) +
    padCode(h.branchCode, 3) +
    padKana(h.branchName, 15) +
    accountTypeCode(h.accountType) +
    padCode(h.accountNumber, 7) +
    ' '.repeat(17) // ダミー
  );
}

/** データレコード（120バイト）。 */
export function buildDataRecord(r: ZenginRecord): string {
  return (
    '2' + // データ区分
    padCode(r.bankCode, 4) +
    padKana(r.bankName, 15) +
    padCode(r.branchCode, 3) +
    padKana(r.branchName, 15) +
    '0000' + // 手形交換所番号（未使用）
    accountTypeCode(r.accountType) +
    padCode(r.accountNumber, 7) +
    padKana(r.recipientName, 30) +
    padNum(r.amount, 10) +
    '0' + // 新規コード
    padKana(r.customerCode ?? '', 10) + // 顧客コード1
    ' '.repeat(10) + // 顧客コード2
    '7' + // 振込指定区分（7=電信）
    ' ' + // 識別表示
    ' '.repeat(7) // ダミー
  );
}

/** トレーラーレコード（120バイト）。 */
export function buildTrailer(count: number, totalAmount: number): string {
  return (
    '8' + // データ区分
    padNum(count, 6) +
    padNum(totalAmount, 12) +
    ' '.repeat(101) // ダミー
  );
}

/** エンドレコード（120バイト）。 */
export function buildEnd(): string {
  return '9' + ' '.repeat(119);
}

export interface ZenginFile {
  content: string; // CRLF 区切りの全銀協テキスト
  count: number;
  totalAmount: number;
}

/** ヘッダー・データ・トレーラー・エンドを組み立てて全銀協テキストを返す。 */
export function buildZenginFile(header: ZenginHeader, records: ZenginRecord[]): ZenginFile {
  const totalAmount = records.reduce((s, r) => s + Math.max(0, Math.floor(r.amount)), 0);
  const lines = [
    buildHeader(header),
    ...records.map(buildDataRecord),
    buildTrailer(records.length, totalAmount),
    buildEnd(),
  ];
  return { content: lines.join('\r\n') + '\r\n', count: records.length, totalAmount };
}

/**
 * 全銀協テキストを単バイト列（JIS X 0201）に符号化して Buffer で返す。
 * 半角カナ(U+FF61–U+FF9F)は 0xA1–0xDF に、ASCII はそのまま、CR/LF も保持する。
 * これは Shift-JIS の下位互換範囲であり、全銀協で許容される文字はすべてこの範囲に収まる。
 */
export function encodeJisX0201(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xFF61 && code <= 0xFF9F) bytes.push(code - 0xFF61 + 0xA1); // 半角カナ
    else if (code <= 0x7F) bytes.push(code); // ASCII / CR / LF
    else bytes.push(0x20); // 想定外はスペース
  }
  return Buffer.from(bytes);
}
