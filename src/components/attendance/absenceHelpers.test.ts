import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/attendance';
import {
  absenceErrorMessage,
  istTime,
  outcomeNotice,
  refusalMessage,
  reportStatusLabel,
  sortDecided,
  sortForBda,
  sortPending,
  successNotice,
  withFriendlyError,
} from './absenceHelpers';
import { approvedReport, pendingNew, pendingOld, rejectedReport, withdrawnReport } from './absenceFixtures';

describe('absenceErrorMessage', () => {
  it('shows the server message when there is one', () => {
    const e = new ApiError(409, 'already_fined', 'This call already has a fine of INR 500.');
    expect(absenceErrorMessage(e)).toBe('This call already has a fine of INR 500.');
  });

  it('never leaks a 403 body, it uses the friendly forbidden line', () => {
    const e = new ApiError(403, 'forbidden', 'user bda@x.com lacks role admin');
    expect(absenceErrorMessage(e)).toBe('You do not have permission to do that.');
  });

  it('falls back to a friendly line for a known code with a generic message', () => {
    const e = new ApiError(409, 'not_pending', 'Request failed (409)');
    expect(absenceErrorMessage(e)).toMatch(/already decided/);
    const tooOld = new ApiError(422, 'too_old', 'Request failed (422)');
    expect(absenceErrorMessage(tooOld)).toMatch(/30 days/);
  });

  it('uses the fallback for an unknown code and for non-errors', () => {
    expect(absenceErrorMessage(new ApiError(500, null, 'Request failed (500)'), 'Boom')).toBe('Boom');
    expect(absenceErrorMessage('nope', 'Boom')).toBe('Boom');
    expect(absenceErrorMessage(new Error('Could not reach the server'))).toBe('Could not reach the server');
  });
});

describe('withFriendlyError', () => {
  it('passes the value through and rewrites a failure into a plain Error', async () => {
    await expect(withFriendlyError(Promise.resolve(7))).resolves.toBe(7);
    await expect(withFriendlyError(Promise.reject(new ApiError(403, 'forbidden', 'x')))).rejects.toThrow('You do not have permission to do that.');
  });
});

describe('labels and times', () => {
  it('words a pending report differently for an admin and for the BDA', () => {
    expect(reportStatusLabel('pending', true)).toBe('Waiting for review');
    expect(reportStatusLabel('pending', false)).toBe('Pending review');
    expect(reportStatusLabel('cancelled', false)).toBe('Withdrawn');
  });

  it('prints call times in IST and survives bad input', () => {
    expect(istTime('2026-10-07T09:30:00.000Z')).toBe('Wed, Oct 7, 3:00 PM IST');
    expect(istTime(null)).toBe('-');
    expect(istTime('not a date')).toBe('-');
  });

  it('tells an admin the fine is recorded and a BDA that it waits for review', () => {
    expect(successNotice({ status: 'approved', clientName: 'Ava' })).toBe('Absence recorded for Ava. The fine was added to the ledger.');
    expect(successNotice({ status: 'pending', clientName: 'Ava' })).toMatch(/fine only starts after approval/);
  });
});

describe('report ordering', () => {
  it('puts the oldest pending report first for the review queue', () => {
    expect(sortPending([pendingNew, pendingOld]).map((r) => r.reportId)).toEqual(['abs_1', 'abs_2']);
  });

  it('puts the latest decision first', () => {
    expect(sortDecided([rejectedReport, approvedReport, withdrawnReport]).map((r) => r.reportId)).toEqual(['abs_3', 'abs_4', 'abs_5']);
  });

  it('shows a BDA their pending reports first, newest first, then the decided ones', () => {
    const out = sortForBda([approvedReport, pendingOld, rejectedReport, pendingNew]).map((r) => r.reportId);
    expect(out).toEqual(['abs_2', 'abs_1', 'abs_3', 'abs_4']);
  });

  it('does not change its input', () => {
    const input = [pendingNew, pendingOld];
    sortPending(input);
    expect(input.map((r) => r.reportId)).toEqual(['abs_2', 'abs_1']);
  });
});

describe('outcomeNotice', () => {
  const approved = (name: string) => ({ ...approvedReport, clientName: name });
  const pending = (name: string) => ({ ...pendingOld, clientName: name });

  it('keeps the single-call wording for one saved call', () => {
    expect(outcomeNotice({ saved: [approved('Ava Stone')], failed: [] })).toBe('Absence recorded for Ava Stone. The fine was added to the ledger.');
    expect(outcomeNotice({ saved: [pending('Ava Stone')], failed: [] })).toContain('Report sent for Ava Stone');
  });

  it('counts several saved calls for an admin and for a BDA', () => {
    expect(outcomeNotice({ saved: [approved('A'), approved('B')], failed: [] })).toBe('2 absences recorded. The fines were added to the ledger.');
    expect(outcomeNotice({ saved: [pending('A'), pending('B'), pending('C')], failed: [] })).toBe(
      '3 reports sent. An admin will review them, and fines only start after approval.',
    );
  });

  it('names every refused call so nothing fails silently', () => {
    const text = outcomeNotice({ saved: [approved('A'), approved('B')], failed: [{ clientName: 'Meera Pillai', message: 'This call already has a fine.' }] });
    expect(text).toContain('2 absences recorded');
    expect(text).toContain('1 refused. Meera Pillai: This call already has a fine.');
    expect(outcomeNotice({ saved: [approved('A')], failed: [{ clientName: 'Meera', message: 'Too old.' }] })).toBe(
      '1 absence recorded. The fine was added to the ledger. 1 refused. Meera: Too old.',
    );
    expect(outcomeNotice({ saved: [], failed: [{ clientName: 'Meera', message: 'Too old.' }] })).toBe('Nothing was saved. Meera: Too old.');
  });
});

describe('refusalMessage', () => {
  it('uses the server sentence, then the stock one, then a generic one', () => {
    expect(refusalMessage({ code: 'x', message: 'Custom words.' })).toBe('Custom words.');
    expect(refusalMessage({ code: 'too_old', message: '' })).toContain('30 days');
    expect(refusalMessage({ code: 'weird', message: '' })).toBe('That call could not be saved.');
  });
});
