import { describe, it, expect } from 'vitest'
import { trainingLevel, sortTrainingRows, type TrainingLevel } from './training-status'

const base = { requiredCount: 5, missingCount: 0, staleCount: 0, openFollowUps: 0 }

describe('trainingLevel', () => {
  it('is GREEN when nothing is required or everything is complete and current', () => {
    expect(trainingLevel(base)).toBe('GREEN')
    expect(trainingLevel({ ...base, requiredCount: 0 })).toBe('GREEN')
  })

  it('is YELLOW when required guides are missing', () => {
    expect(trainingLevel({ ...base, missingCount: 2 })).toBe('YELLOW')
  })

  it('is RED when a completion is stale (retraining) or a follow-up is open', () => {
    expect(trainingLevel({ ...base, staleCount: 1 })).toBe('RED')
    expect(trainingLevel({ ...base, openFollowUps: 1 })).toBe('RED')
    expect(trainingLevel({ ...base, missingCount: 3, staleCount: 1 })).toBe('RED')
  })
})

describe('sortTrainingRows', () => {
  const row = (name: string, level: TrainingLevel, onShift: boolean) => ({ name, level, onShift })

  it('puts on-shift staff first', () => {
    const sorted = sortTrainingRows([row('ZED', 'GREEN', false), row('AMY', 'GREEN', true)])
    expect(sorted.map((r) => r.name)).toEqual(['AMY', 'ZED'])
  })

  it('orders by urgency within a group and then by name', () => {
    const sorted = sortTrainingRows([
      row('BEA', 'GREEN', true),
      row('CAL', 'RED', true),
      row('DAN', 'YELLOW', true),
      row('ANN', 'YELLOW', true),
    ])
    expect(sorted.map((r) => r.name)).toEqual(['CAL', 'ANN', 'DAN', 'BEA'])
  })
})
