import { describe, it, expect } from 'vitest'
import {
  TASK_OUTCOMES,
  normaliseOutcomes,
  resolveOutcomePolicy,
  resolveOutcomePolicyForChecklists,
  isTerminalOutcome,
  isDoneOutcome,
  isTaskOutcome,
  outcomeValidationError,
} from '@/lib/task-outcomes'

describe('task-outcomes', () => {
  it('recognises only the known outcomes', () => {
    expect(isTaskOutcome('DONE')).toBe(true)
    expect(isTaskOutcome('PARTIAL')).toBe(true)
    expect(isTaskOutcome('BOGUS')).toBe(false)
    expect(isTaskOutcome(null)).toBe(false)
  })

  it('always includes DONE and de-duplicates in display order', () => {
    expect(normaliseOutcomes(null)).toEqual([...TASK_OUTCOMES])
    expect(normaliseOutcomes(['NOT_REQUIRED', 'NOT_REQUIRED'])).toEqual(['DONE', 'NOT_REQUIRED'])
    expect(normaliseOutcomes([])).toEqual(['DONE'])
  })

  it('falls back to all outcomes when a task has no override and no list', () => {
    const policy = resolveOutcomePolicy({})
    expect(policy.allowed).toEqual([...TASK_OUTCOMES])
    expect(policy.requireReason).toBe(false)
    expect(policy.source).toBe('DEFAULT')
  })

  it('uses the list defaults when the task does not override', () => {
    const policy = resolveOutcomePolicy(
      { overrideOutcomes: false },
      { allowedOutcomes: ['PARTIAL', 'DID_NOT_COMPLETE'], requireOutcomeReason: true },
    )
    expect(policy.allowed).toEqual(['DONE', 'PARTIAL', 'DID_NOT_COMPLETE'])
    expect(policy.requireReason).toBe(true)
    expect(policy.source).toBe('LIST')
  })

  it('treats an unconfigured (empty) checklist as all outcomes', () => {
    const policy = resolveOutcomePolicy(
      { overrideOutcomes: false },
      { allowedOutcomes: [], requireOutcomeReason: false },
    )
    expect(policy.allowed).toEqual([...TASK_OUTCOMES])
  })

  it('lets a task override the list', () => {
    const policy = resolveOutcomePolicy(
      { overrideOutcomes: true, allowedOutcomes: ['NOT_REQUIRED'], requireOutcomeReason: false },
      { allowedOutcomes: ['PARTIAL'], requireOutcomeReason: true },
    )
    expect(policy.allowed).toEqual(['DONE', 'NOT_REQUIRED'])
    expect(policy.requireReason).toBe(false)
    expect(policy.source).toBe('TASK')
  })

  it('can express only DONE via a task override with an empty list', () => {
    const policy = resolveOutcomePolicy({ overrideOutcomes: true, allowedOutcomes: [] })
    expect(policy.allowed).toEqual(['DONE'])
  })

  it('treats PARTIAL as non-terminal and only DONE as complete', () => {
    expect(isTerminalOutcome('DONE')).toBe(true)
    expect(isTerminalOutcome('NOT_REQUIRED')).toBe(true)
    expect(isTerminalOutcome('DID_NOT_COMPLETE')).toBe(true)
    expect(isTerminalOutcome('PARTIAL')).toBe(false)
    expect(isDoneOutcome('DONE')).toBe(true)
    expect(isDoneOutcome('NOT_REQUIRED')).toBe(false)
    expect(isDoneOutcome(null)).toBe(false)
  })

  it('picks the first open checklist for the policy', () => {
    const today = new Date('2026-10-22T00:00:00.000Z')
    const task = { overrideOutcomes: false }
    const checklists = [
      { name: 'CLOSE', appearFromTime: '22:00', allowedOutcomes: ['NOT_REQUIRED' as const], requireOutcomeReason: false },
      { name: 'OPEN', appearFromTime: '08:00', allowedOutcomes: ['PARTIAL' as const], requireOutcomeReason: true },
    ]
    const policy = resolveOutcomePolicyForChecklists(task, checklists, { today, nowHHmm: '09:00' })
    expect(policy.source).toBe('LIST')
    expect(policy.allowed).toEqual(['DONE', 'PARTIAL'])
    expect(policy.requireReason).toBe(true)
  })

  it('falls back to the earliest list when none are open yet', () => {
    const today = new Date('2026-10-22T00:00:00.000Z')
    const checklists = [
      { name: 'LATE', appearFromTime: '22:00', allowedOutcomes: ['DID_NOT_COMPLETE' as const] },
      { name: 'EARLY', appearFromTime: '08:00', allowedOutcomes: ['NOT_REQUIRED' as const] },
    ]
    const policy = resolveOutcomePolicyForChecklists({ overrideOutcomes: false }, checklists, { today, nowHHmm: '06:00' })
    expect(policy.allowed).toEqual(['DONE', 'NOT_REQUIRED'])
  })

  it('lets a task override win over every checklist', () => {
    const today = new Date('2026-10-22T00:00:00.000Z')
    const policy = resolveOutcomePolicyForChecklists(
      { overrideOutcomes: true, allowedOutcomes: [] },
      [{ name: 'LIST', appearFromTime: null, allowedOutcomes: ['PARTIAL'] }],
      { today, nowHHmm: '09:00' },
    )
    expect(policy.source).toBe('TASK')
    expect(policy.allowed).toEqual(['DONE'])
  })

  it('validates the outcome against the policy', () => {
    expect(outcomeValidationError({ outcome: 'DONE', allowed: ['DONE'], requireReason: false })).toBeNull()
    expect(outcomeValidationError({ outcome: 'PARTIAL', allowed: ['DONE'], requireReason: false })).toContain('NOT AVAILABLE')
    expect(outcomeValidationError({ outcome: 'DID_NOT_COMPLETE', allowed: ['DONE', 'DID_NOT_COMPLETE'], requireReason: true, note: '  ' })).toBe('A REASON IS REQUIRED')
    expect(outcomeValidationError({ outcome: 'DID_NOT_COMPLETE', allowed: ['DONE', 'DID_NOT_COMPLETE'], requireReason: true, note: 'NO STOCK' })).toBeNull()
    expect(outcomeValidationError({ outcome: 'WRONG', allowed: ['DONE'], requireReason: false })).toBe('INVALID OUTCOME')
  })
})
