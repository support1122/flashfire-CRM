import type { MyMonthRow } from '../../types/attendance';

/** Month totals for the My attendance tiles. Only `active` deductions count toward the amount. */
export function summarise(rows: MyMonthRow[]) {
  let present = 0;
  let absent = 0;
  let pending = 0;
  let called = 0;
  let notCalled = 0;
  let stuck = 0;
  let activeInr = 0;
  let underReview = 0;
  for (const r of rows) {
    const verdict = r.attendance?.verdict ?? null;
    if (verdict === 'present') present += 1;
    else if (verdict === 'absent') absent += 1;
    else pending += 1;
    if (r.callSummary) {
      if (r.callSummary.calls > 0) called += 1;
      else notCalled += 1;
    }
    if (r.statusUpdate?.stuck) stuck += 1;
    for (const d of r.deductions ?? []) {
      if (d.status === 'active') activeInr += d.amountInr;
      else if (d.status === 'needs_review') underReview += 1;
    }
  }
  return { meetings: rows.length, present, absent, pending, called, notCalled, stuck, activeInr, underReview };
}
