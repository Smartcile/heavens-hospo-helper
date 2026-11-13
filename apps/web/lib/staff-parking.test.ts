import { describe, expect, it } from 'vitest'
import {
  describePlateStatus,
  describeRequestStatus,
  nextPlateFromApproval,
  plateSubmissionError,
  requestKind,
  requiresChangeReason,
  reviewTransitionError,
  sortStaffPlateRequests,
  validateReviewAction,
} from './staff-parking'

const ACTIVE = [{ id: 'p1', plate: 'ABC123', status: 'ACTIVE' }]

describe('requiresChangeReason', () => {
  it('needs no reason for the first plate', () => {
    expect(requiresChangeReason(0)).toBe(false)
    expect(requiresChangeReason(1)).toBe(true)
  })
})

describe('plateSubmissionError', () => {
  it('validates the plate', () => {
    expect(
      plateSubmissionError({ plate: '', activePlates: [], staffId: 's1' }),
    ).toContain('1–6')
    expect(
      plateSubmissionError({ plate: 'TOOLONG', activePlates: [], staffId: 's1' }),
    ).toContain('1–6')
  })

  it('rejects a duplicate on the same person', () => {
    expect(
      plateSubmissionError({ plate: 'abc123', activePlates: ACTIVE, staffId: 's1', reason: 'x' }),
    ).toBe('THAT PLATE IS ALREADY ON YOUR LIST')
  })

  it('rejects a plate already waiting for approval', () => {
    expect(
      plateSubmissionError({
        plate: 'XYZ9',
        activePlates: [],
        pendingPlates: ['xyz9'],
        staffId: 's1',
      }),
    ).toBe('THIS PLATE IS ALREADY WAITING FOR APPROVAL')
  })

  it('rejects a plate held by another staff member', () => {
    expect(
      plateSubmissionError({
        plate: 'XYZ9',
        activePlates: [],
        otherOwners: [{ staffId: 's2', plate: 'XYZ9' }],
        staffId: 's1',
      }),
    ).toBe('THAT PLATE IS ALREADY REGISTERED TO ANOTHER STAFF MEMBER')
  })

  it('requires a note once the person already has a plate', () => {
    expect(
      plateSubmissionError({ plate: 'XYZ9', activePlates: ACTIVE, staffId: 's1' }),
    ).toBe('ADD A NOTE TO EXPLAIN THIS CHANGE')
    expect(
      plateSubmissionError({ plate: 'XYZ9', activePlates: ACTIVE, staffId: 's1', reason: 'new car' }),
    ).toBeNull()
  })

  it('caps the note length', () => {
    expect(
      plateSubmissionError({
        plate: 'XYZ9',
        activePlates: [],
        staffId: 's1',
        reason: 'x'.repeat(501),
      }),
    ).toContain('500')
  })
})

describe('review rules', () => {
  it('accepts only APPROVE / REJECT', () => {
    expect(validateReviewAction('approve')).toBe('APPROVE')
    expect(validateReviewAction('reject')).toBe('REJECT')
    expect(validateReviewAction('delete')).toBeNull()
  })

  it('only reviews pending requests', () => {
    expect(reviewTransitionError('PENDING')).toBeNull()
    expect(reviewTransitionError('APPROVED')).toContain('ALREADY')
  })
})

describe('display helpers', () => {
  it('names the request kind and statuses', () => {
    expect(requestKind(null)).toBe('ADD')
    expect(requestKind('ABC123')).toBe('CHANGE')
    expect(describeRequestStatus('PENDING')).toBe('WAITING FOR APPROVAL')
    expect(describeRequestStatus('APPROVED')).toBe('APPROVED')
    expect(describePlateStatus('ACTIVE')).toBe('ACTIVE')
    expect(describePlateStatus('RETIRED')).toBe('RETIRED')
  })

  it('sorts pending first then newest', () => {
    const rows = [
      { id: 'a', status: 'APPROVED', createdAt: '2026-01-02T00:00:00Z' },
      { id: 'b', status: 'PENDING', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'c', status: 'PENDING', createdAt: '2026-01-03T00:00:00Z' },
    ]
    expect(sortStaffPlateRequests(rows).map((row) => row.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('nextPlateFromApproval', () => {
  it('adds an extra plate without retiring the others', () => {
    const plan = nextPlateFromApproval({
      existing: [...ACTIVE, { id: 'p2', plate: 'OLD1', status: 'ACTIVE' }],
      plate: 'new 99',
    })
    expect(plan.plate).toBe('NEW99')
    expect(plan.retireIds).toEqual([])
  })

  it('retires only the plate being replaced', () => {
    const plan = nextPlateFromApproval({
      existing: [...ACTIVE, { id: 'p2', plate: 'OLD1', status: 'ACTIVE' }],
      previousPlate: 'old1',
      plate: 'new 99',
    })
    expect(plan.plate).toBe('NEW99')
    expect(plan.retireIds).toEqual(['p2'])
  })
})
