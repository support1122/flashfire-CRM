// Stub data for the absence feature. Used by the Vitest suites. Not imported by any production code.
import type { AbsenceCandidate, AbsenceReport } from '../../types/absence';
import { KALPATARU, SIDDHARTHA } from './attendanceAdminFixtures';

export function report(id: string, partial: Partial<AbsenceReport>): AbsenceReport {
  return {
    reportId: id,
    kind: 'allocation',
    refId: `alloc_${id}`,
    bdaEmail: SIDDHARTHA.email,
    bdaName: SIDDHARTHA.name,
    clientName: 'Client',
    callStart: '2026-10-07T09:30:00.000Z',
    reason: 'The call dropped and the client never rang back.',
    raisedBy: 'bda',
    raisedByName: SIDDHARTHA.name,
    status: 'pending',
    decidedByName: null,
    decidedAt: null,
    decisionNote: null,
    deductionId: null,
    createdAt: '2026-10-07T10:00:00.000Z',
    ...partial,
  };
}

export const pendingOld = report('abs_1', { clientName: 'Hemanth Dasu', createdAt: '2026-10-06T08:00:00.000Z', callStart: '2026-10-06T06:30:00.000Z' });
export const pendingNew = report('abs_2', {
  kind: 'booking',
  refId: 'bk_77',
  bdaEmail: KALPATARU.email,
  bdaName: KALPATARU.name,
  raisedByName: KALPATARU.name,
  clientName: 'Priya Raghavan',
  reason: 'Client asked to move the meeting by chat and I could not confirm in time.',
  createdAt: '2026-10-07T07:30:00.000Z',
});
export const approvedReport = report('abs_3', {
  status: 'approved',
  clientName: 'Nadia Rahman',
  decidedByName: 'Sohith',
  decidedAt: '2026-10-07T18:00:00.000Z',
  decisionNote: 'Checked the call log, confirmed.',
  deductionId: 'ded_1010',
});
export const rejectedReport = report('abs_4', {
  status: 'rejected',
  clientName: 'Elena Fischer',
  decidedByName: 'Sohith',
  decidedAt: '2026-10-05T11:00:00.000Z',
  decisionNote: 'The call log shows a 12 minute connected call.',
});
export const withdrawnReport = report('abs_5', { status: 'cancelled', clientName: 'Rohan Deshpande', decidedAt: '2026-10-04T09:00:00.000Z' });

export const candidateAllocation: AbsenceCandidate = {
  kind: 'allocation',
  refId: 'alloc_9',
  bdaEmail: SIDDHARTHA.email,
  bdaName: SIDDHARTHA.name,
  clientName: 'Tomasz Kowalczyk',
  callStart: '2026-10-07T09:30:00.000Z',
  detail: '+1 415 555 0134',
};
export const candidateAllocation2: AbsenceCandidate = {
  ...candidateAllocation,
  refId: 'alloc_10',
  bdaEmail: KALPATARU.email,
  bdaName: KALPATARU.name,
  clientName: 'Meera Pillai',
  callStart: '2026-10-06T14:00:00.000Z',
  detail: 'meera@example.com',
};
export const candidateBooking: AbsenceCandidate = {
  kind: 'booking',
  refId: 'bk_55',
  bdaEmail: SIDDHARTHA.email,
  bdaName: SIDDHARTHA.name,
  clientName: 'Daniel Brooks',
  callStart: '2026-10-05T13:30:00.000Z',
  detail: 'bk_55',
};
