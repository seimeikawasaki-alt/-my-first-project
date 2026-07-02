// Shared work-time calculations used by both attendance recording and payroll.
// Kept dependency-free and pure so they can be unit-tested without a DB.

/**
 * Late-night minutes (22:00–05:00) within [punchIn, punchOut).
 * Works across midnight and month boundaries because it operates purely on
 * absolute timestamps split into hour segments.
 */
export function calcLateNightMinutes(punchIn: Date, punchOut: Date): number {
  const totalMs = punchOut.getTime() - punchIn.getTime();
  if (totalMs <= 0) return 0;

  let total = 0;
  const cursor = new Date(punchIn);
  cursor.setSeconds(0, 0);
  // Clamp start up to the minute boundary of punchIn
  if (cursor < punchIn) cursor.setMinutes(cursor.getMinutes() + 1);

  const end = new Date(punchOut);

  while (cursor < end) {
    const next = new Date(cursor);
    next.setHours(next.getHours() + 1, 0, 0, 0);
    const segEnd = next < end ? next : end;
    const segMinutes = Math.round((segEnd.getTime() - cursor.getTime()) / 60000);
    const h = cursor.getHours();
    if (h >= 22 || h < 5) {
      total += segMinutes;
    }
    cursor.setTime(next.getTime());
  }

  return total;
}

/** Net worked minutes = (out − in) − break. */
export function calcWorkMinutes(
  punchIn: Date,
  punchOut: Date,
  breakStart?: Date | null,
  breakEnd?: Date | null,
): number {
  const totalMs = punchOut.getTime() - punchIn.getTime();
  let breakMs = 0;
  if (breakStart && breakEnd && breakEnd > breakStart) {
    breakMs = breakEnd.getTime() - breakStart.getTime();
  }
  return Math.round((totalMs - breakMs) / 60000);
}
