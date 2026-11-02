import { describe, it, expect } from 'vitest'
import { completionReportWheres } from '@/lib/report-filters'

describe('completionReportWheres', () => {
  it('counts DONE only for the completion metric, while the list keeps every outcome', () => {
    const { all, done } = completionReportWheres({ venueId: 'v1' })
    expect(all).toEqual({ task: { venueId: 'v1' } })
    expect(done).toEqual({ task: { venueId: 'v1' }, outcome: 'DONE' })
  })

  it('pins a MANAGER to their own venue', () => {
    const { done } = completionReportWheres({ venueId: 'other', managerVenueId: 'own' })
    expect(done.task).toEqual({ venueId: 'own' })
  })

  it('combines department, staff and date filters', () => {
    const { done } = completionReportWheres({
      venueId: 'v1',
      departmentId: 'd1',
      staffId: 's1',
      from: '2026-10-01',
      to: '2026-10-31',
    })
    expect(done.task).toEqual({ venueId: 'v1', departmentId: 'd1' })
    expect(done.staffId).toBe('s1')
    expect(done.scheduledDate).toEqual({
      gte: new Date('2026-10-01'),
      lte: new Date('2026-10-31'),
    })
    expect(done.outcome).toBe('DONE')
  })

  it('omits empty filters', () => {
    expect(completionReportWheres({})).toEqual({ all: {}, done: { outcome: 'DONE' } })
  })
})
