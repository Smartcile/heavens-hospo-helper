import { describe, expect, it } from 'vitest'
import { checklistApplicabilityWhere } from './checklist-applicability'

interface AudienceClause {
  departmentId?: unknown
  tasks?: unknown
  audiences?: {
    none?: Record<string, never>
    some?: { kind?: string; targetId?: unknown }
  }
}

type Where = ReturnType<typeof checklistApplicabilityWhere>

function clauses(where: Where): AudienceClause[] {
  return (where.OR ?? []) as unknown as AudienceClause[]
}

function audienceClause(where: Where, kind: string) {
  return clauses(where).find((clause) => clause.audiences?.some?.kind === kind)
}

describe('checklistApplicabilityWhere', () => {
  const scope = {
    departmentIds: ['MANAGERS', 'FOH'],
    sectionIds: ['FLOOR'],
    positionIds: ['DUTY'],
  }
  const where = checklistApplicabilityWhere('venue-1', scope)

  it('scopes to the venue and only live, active lists', () => {
    expect(where.venueId).toBe('venue-1')
    expect(where.deletedAt).toBeNull()
    expect(where.isActive).toBe(true)
  })

  it('matches a DEPARTMENT audience against home AND linked departments', () => {
    expect(audienceClause(where, 'DEPARTMENT')?.audiences?.some?.targetId).toEqual({
      in: ['MANAGERS', 'FOH'],
    })
  })

  it('matches SECTION and POSITION audiences against the staff holdings', () => {
    expect(audienceClause(where, 'SECTION')?.audiences?.some?.targetId).toEqual({ in: ['FLOOR'] })
    expect(audienceClause(where, 'POSITION')?.audiences?.some?.targetId).toEqual({ in: ['DUTY'] })
  })

  it('includes no-audience lists for the scoped departments and the venue-wide bucket', () => {
    const noAudience = clauses(where).filter((clause) => clause.audiences?.none)
    expect(noAudience).toHaveLength(2)
    expect(noAudience[0].departmentId).toEqual({ in: ['MANAGERS', 'FOH'] })
    expect(noAudience[1].departmentId).toBeNull()
  })

  it('drops department clauses when the staff member has no department', () => {
    const none = checklistApplicabilityWhere('venue-1', {
      departmentIds: null,
      sectionIds: [],
      positionIds: [],
    })
    expect(audienceClause(none, 'DEPARTMENT')).toBeUndefined()
    expect(audienceClause(none, 'SECTION')).toBeUndefined()
    expect(audienceClause(none, 'POSITION')).toBeUndefined()
    const noAudience = clauses(none).filter((clause) => clause.audiences?.none)
    expect(noAudience).toHaveLength(1)
    expect(noAudience[0].departmentId).toBeNull()
  })

  it('adds the task filter only when a task is supplied', () => {
    expect(where.tasks).toBeUndefined()
    const filtered = checklistApplicabilityWhere('venue-1', { ...scope, taskId: 'task-1' })
    expect(filtered.tasks).toEqual({ some: { taskId: 'task-1' } })
  })
})
