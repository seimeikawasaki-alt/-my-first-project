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

/**
 * Scheduled ("base") work minutes for a shift type: the span from start to end
 * (rolling over midnight for overnight shifts) minus the break. Time worked
 * beyond this base is treated as overtime.
 */
export function shiftBaseMinutes(shiftType: {
  startTime: string;
  endTime: string;
  breakMinutes?: number | null;
  isOvernight?: boolean;
}): number {
  const [sh, sm] = shiftType.startTime.split(':').map(Number);
  const [eh, em] = shiftType.endTime.split(':').map(Number);
  let span = (eh * 60 + em) - (sh * 60 + sm);
  if (span <= 0 || shiftType.isOvernight) span += 24 * 60; // crosses midnight
  return Math.max(0, span - (shiftType.breakMinutes ?? 0));
}

/**
 * If punch-out is not after punch-in, the shift crosses midnight — roll the
 * punch-out forward by one day so the duration is correct.
 */
export function rollOvernight(punchIn: Date, punchOut: Date): Date {
  if (punchOut.getTime() <= punchIn.getTime()) {
    return new Date(punchOut.getTime() + 24 * 60 * 60 * 1000);
  }
  return punchOut;
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
