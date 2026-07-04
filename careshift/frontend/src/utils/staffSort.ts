// Shared helpers for staff searching / ordering across admin screens.

export interface StaffNameLike {
  lastName: string;
  firstName: string;
  lastNameKana?: string | null;
  firstNameKana?: string | null;
  userCode?: string;
}

/** Kana sort key (あいうえお順). Falls back to the kanji name when kana is missing. */
export function kanaKey(u: StaffNameLike): string {
  const last = u.lastNameKana || u.lastName || '';
  const first = u.firstNameKana || u.firstName || '';
  return `${last} ${first}`;
}

/** Comparator for あいうえお order. */
export function compareKana(a: StaffNameLike, b: StaffNameLike): number {
  return kanaKey(a).localeCompare(kanaKey(b), 'ja');
}

/** True if the staff matches a free-text query (name / kana / ID). */
export function matchStaff(u: StaffNameLike, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    u.lastName, u.firstName, `${u.lastName}${u.firstName}`, `${u.lastName} ${u.firstName}`,
    u.lastNameKana, u.firstNameKana, u.userCode,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}
