import { describe, it, expect } from 'vitest'
import {
  matchTaskRows,
  parseTaskImportAnswer,
  resolveTaskImportRefs,
  type TaskImportRefs,
} from './task'

function refs(overrides: Partial<TaskImportRefs> = {}): TaskImportRefs {
  return {
    departments: [{ id: 'd1', name: 'KITCHEN' }],
    sections: [{ id: 's1', name: 'PREP', departmentName: 'KITCHEN' }],
    checklists: [{ id: 'c1', name: 'OPENING' }],
    ...overrides,
  }
}

function parseAndRows(tasks: unknown[]) {
  const result = parseTaskImportAnswer(JSON.stringify({ tasks }))
  if ('error' in result) throw new Error(result.error)
  return result.rows
}

describe('parseTaskImportAnswer', () => {
  it('parses a task with day names and a description', () => {
    const result = parseTaskImportAnswer(JSON.stringify({
      tasks: [{
        title: 'wipe benches',
        description: '- spray\n- wipe',
        department: 'kitchen',
        section: 'prep',
        checklist: 'opening',
        completionType: 'TICK_NOTE',
        scheduleType: 'WEEKLY',
        scheduleDays: ['MON', 'WED'],
      }],
    }))
    if ('error' in result) throw new Error(result.error)
    const row = result.rows[0]
    expect(row.values.title).toBe('WIPE BENCHES')
    expect(row.values.departmentName).toBe('KITCHEN')
    expect(row.values.scheduleType).toBe('WEEKLY')
    expect(row.values.scheduleDays).toEqual([1, 3])
    expect(row.values.completionType).toBe('TICK_NOTE')
    expect(row.values.descriptionHtml).toContain('<li>spray</li>')
    expect(row.action).toBe('CREATE')
  })

  it('flags a weekly task with no days as an error', () => {
    const rows = parseAndRows([{ title: 'WEEKLY JOB', scheduleType: 'WEEKLY', scheduleDays: [] }])
    expect(rows[0].issues.some((i) => i.code === 'WEEKLY_DAYS_MISSING' && i.severity === 'ERROR')).toBe(true)
  })

  it('warns and defaults an unknown completion type / schedule', () => {
    const rows = parseAndRows([{ title: 'ODD JOB', completionType: 'MAGIC', scheduleType: 'YEARLY' }])
    expect(rows[0].values.completionType).toBe('TICK')
    expect(rows[0].values.scheduleType).toBe('DAILY')
    expect(rows[0].issues.some((i) => i.code === 'COMPLETION_TYPE_INVALID')).toBe(true)
    expect(rows[0].issues.some((i) => i.code === 'SCHEDULE_TYPE_INVALID')).toBe(true)
  })

  it('flags monthly without a valid option', () => {
    const rows = parseAndRows([{ title: 'MONTHLY JOB', scheduleType: 'MONTHLY', monthlyOption: 'NOPE' }])
    expect(rows[0].issues.some((i) => i.code === 'MONTHLY_OPTION_INVALID' && i.severity === 'ERROR')).toBe(true)
  })

  it('marks an in-file duplicate and keeps only the first', () => {
    const rows = parseAndRows([{ title: 'JOB' }, { title: 'job' }])
    expect(rows[1].match?.status).toBe('DUPLICATE_IN_FILE')
    expect(rows[1].action).toBe('SKIP')
  })

  it('errors with no JSON or no tasks', () => {
    expect(parseTaskImportAnswer('nope')).toEqual({ error: 'NO JSON FOUND IN THE ANSWER' })
    expect(parseTaskImportAnswer('{"tasks": []}')).toEqual({ error: 'NO TASKS FOUND IN THE ANSWER' })
  })
})

describe('matchTaskRows', () => {
  const existing = [
    { id: 'e1', name: 'WIPE BENCHES' },
    { id: 'e2', name: 'SWEEP FLOOR' },
    { id: 'e3', name: 'SWEEP FLOOR' },
  ]

  it('defaults an exact single match to SKIP/MATCH', () => {
    const matched = matchTaskRows(parseAndRows([{ title: 'wipe benches' }]), existing)
    expect(matched[0].action).toBe('SKIP')
    expect(matched[0].match).toMatchObject({ status: 'MATCH', targetId: 'e1' })
  })

  it('marks duplicate names AMBIGUOUS', () => {
    const matched = matchTaskRows(parseAndRows([{ title: 'SWEEP FLOOR' }]), existing)
    expect(matched[0].match?.status).toBe('AMBIGUOUS')
  })

  it('marks a near copy SIMILAR', () => {
    const matched = matchTaskRows(parseAndRows([{ title: 'SWEEP FLOORS' }]), [{ id: 'e2', name: 'SWEEP FLOOR' }])
    expect(matched[0].match?.status).toBe('SIMILAR')
  })
})

describe('resolveTaskImportRefs', () => {
  it('resolves known department / section / checklist and keeps the row', () => {
    const rows = parseAndRows([{ title: 'JOB', department: 'KITCHEN', section: 'PREP', checklist: 'OPENING' }])
    const resolved = resolveTaskImportRefs(rows, refs())
    expect(resolved[0].issues).toHaveLength(0)
    expect(resolved[0].action).toBe('CREATE')
  })

  it('flags an unknown department and skips the row', () => {
    const rows = parseAndRows([{ title: 'JOB', department: 'NOWHERE' }])
    const resolved = resolveTaskImportRefs(rows, refs())
    expect(resolved[0].issues.some((i) => i.code === 'DEPARTMENT_NOT_FOUND')).toBe(true)
    expect(resolved[0].action).toBe('SKIP')
  })

  it('flags an unknown section and checklist', () => {
    const rows = parseAndRows([{ title: 'JOB', section: 'NOWHERE', checklist: 'MISSING' }])
    const resolved = resolveTaskImportRefs(rows, refs())
    expect(resolved[0].issues.some((i) => i.code === 'SECTION_NOT_FOUND')).toBe(true)
    expect(resolved[0].issues.some((i) => i.code === 'CHECKLIST_NOT_FOUND')).toBe(true)
  })
})
