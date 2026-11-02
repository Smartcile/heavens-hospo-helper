import { describe, it, expect } from 'vitest'
import {
  readingVerdict,
  criticalVerdict,
  storageTypeTempMax,
  deliveryLineVerdict,
  vehicleVerdict,
  deliveryAlertSeverity,
  healthWidgetMetrics,
  GFMP_DEFAULTS,
  gfmpDefaultFor,
  verdictLabel,
  describeBand,
  readingAlertMessage,
} from './food-safety'

describe('readingVerdict', () => {
  it('PASSes inside the band', () => {
    expect(readingVerdict(3, { readingMin: 0, readingMax: 5 })).toBe('PASS')
  })
  it('FAILs below the minimum', () => {
    expect(readingVerdict(-1, { readingMin: 0, readingMax: 5 })).toBe('FAIL')
  })
  it('FAILs above the maximum', () => {
    expect(readingVerdict(6, { readingMin: 0, readingMax: 5 })).toBe('FAIL')
  })
  it('boundary values PASS (inclusive)', () => {
    expect(readingVerdict(0, { readingMin: 0, readingMax: 5 })).toBe('PASS')
    expect(readingVerdict(5, { readingMin: 0, readingMax: 5 })).toBe('PASS')
  })
  it('single-sided bounds still work (hot hold ≥60)', () => {
    expect(readingVerdict(60, { readingMin: 60 })).toBe('PASS')
    expect(readingVerdict(58, { readingMin: 60 })).toBe('FAIL')
    expect(readingVerdict(75, { readingMax: 20 })).toBe('FAIL')
  })
  it('NA when no pass bounds are configured', () => {
    expect(readingVerdict(4, {})).toBe('NA')
    expect(readingVerdict(4, { readingMin: null, readingMax: null })).toBe('NA')
  })
})

describe('criticalVerdict', () => {
  it('false inside the critical band', () => {
    expect(criticalVerdict(6, { criticalMax: 10, readingMax: 5 })).toBe(false)
  })
  it('true above criticalMax (fridge >10°C)', () => {
    expect(criticalVerdict(11, { criticalMax: 10 })).toBe(true)
  })
  it('true below criticalMin (freezer < -30°C)', () => {
    expect(criticalVerdict(-31, { criticalMin: -30 })).toBe(true)
  })
  it('false when no critical bounds are configured', () => {
    expect(criticalVerdict(99, {})).toBe(false)
  })
  it('boundary values are not critical (inclusive)', () => {
    expect(criticalVerdict(10, { criticalMax: 10 })).toBe(false)
    expect(criticalVerdict(-30, { criticalMin: -30 })).toBe(false)
  })
})

describe('delivery temperature rules', () => {
  it('CHILLED accepts ≤ 5°C', () => {
    expect(storageTypeTempMax('CHILLED')).toBe(5)
    expect(deliveryLineVerdict(5, 'CHILLED')).toBe('PASS')
    expect(deliveryLineVerdict(5.1, 'CHILLED')).toBe('FAIL')
  })
  it('FROZEN accepts ≤ -18°C', () => {
    expect(storageTypeTempMax('FROZEN')).toBe(-18)
    expect(deliveryLineVerdict(-18, 'FROZEN')).toBe('PASS')
    expect(deliveryLineVerdict(-17.5, 'FROZEN')).toBe('FAIL')
  })
  it('AMBIENT has no rule → NA', () => {
    expect(storageTypeTempMax('AMBIENT')).toBeNull()
    expect(deliveryLineVerdict(25, 'AMBIENT')).toBe('NA')
  })
  it('missing temp → NA even for CHILLED/FROZEN', () => {
    expect(deliveryLineVerdict(null, 'CHILLED')).toBe('NA')
    expect(deliveryLineVerdict(undefined, 'FROZEN')).toBe('NA')
  })
  it('unknown storage type → NA', () => {
    expect(storageTypeTempMax('WEIRD')).toBeNull()
    expect(deliveryLineVerdict(3, 'WEIRD')).toBe('NA')
  })
})

describe('vehicleVerdict', () => {
  it('NA with no vehicle temp', () => {
    expect(vehicleVerdict(null, ['CHILLED'])).toBe('NA')
  })
  it('uses the strictest item rule (frozen load)', () => {
    expect(vehicleVerdict(-20, ['CHILLED', 'FROZEN'])).toBe('PASS')
    expect(vehicleVerdict(-15, ['CHILLED', 'FROZEN'])).toBe('FAIL')
  })
  it('NA when no item has a rule', () => {
    expect(vehicleVerdict(10, ['AMBIENT', null])).toBe('NA')
  })
  it('chilled-only load uses 5°C', () => {
    expect(vehicleVerdict(4, ['CHILLED'])).toBe('PASS')
    expect(vehicleVerdict(6, ['CHILLED'])).toBe('FAIL')
  })
})

describe('deliveryAlertSeverity', () => {
  it('ordinary over-temp is WARNING', () => {
    expect(deliveryAlertSeverity(6, 'CHILLED')).toBe('WARNING')
    expect(deliveryAlertSeverity(-17, 'FROZEN')).toBe('WARNING')
  })
  it('thawed frozen load is CRITICAL', () => {
    expect(deliveryAlertSeverity(0.5, 'FROZEN')).toBe('CRITICAL')
    expect(deliveryAlertSeverity(4, 'FROZEN')).toBe('CRITICAL')
  })
  it('badly hot chilled load is CRITICAL', () => {
    expect(deliveryAlertSeverity(10.1, 'CHILLED')).toBe('CRITICAL')
  })
  it('missing temp stays WARNING', () => {
    expect(deliveryAlertSeverity(null, 'CHILLED')).toBe('WARNING')
  })
})

describe('healthWidgetMetrics', () => {
  const tasks = [
    { id: 'a', completionType: 'READING', status: 'ACTIVE' }, // proved, no alerts
    { id: 'b', completionType: 'READING', status: 'ACTIVE' }, // not proved, has alert
    { id: 'c', completionType: 'TICK', status: 'ACTIVE' }, // plain task, has alert
    { id: 'd', completionType: 'READING', status: 'DRAFT' }, // staged — never counts
    { id: 'e', completionType: 'READING', status: 'ARCHIVED' }, // history — never counts
  ]
  const completions = {
    a: [{ valueStatus: 'PASS' as const }, { valueStatus: 'FAIL' as const }],
    b: [{ valueStatus: 'FAIL' as const }],
  }
  const alerts = [
    { id: '1', status: 'OPEN' as const, taskId: 'b' },
    { id: '2', status: 'OPEN' as const, taskId: 'c' },
    { id: '3', status: 'RESOLVED' as const, taskId: 'b' }, // resolved doesn't count
  ]

  it('counts proved reading tasks and alert-bearing active tasks', () => {
    expect(healthWidgetMetrics(tasks, completions, alerts)).toEqual({
      provedX: 1, // only task a
      provedY: 2, // a + b (DRAFT/ARCHIVED excluded)
      alertX: 2, // b + c
      alertY: 3, // a + b + c
    })
  })
  it('empty tasks → zeros', () => {
    expect(healthWidgetMetrics([], {}, [])).toEqual({ provedX: 0, provedY: 0, alertX: 0, alertY: 0 })
  })
  it('missing completion lists count as none', () => {
    expect(healthWidgetMetrics(tasks, {}, alerts).provedX).toBe(0)
  })
  it('tasks with null status are treated as ACTIVE (legacy rows)', () => {
    const legacy = [{ id: 'x', completionType: 'READING' }]
    expect(healthWidgetMetrics(legacy, { x: [{ valueStatus: 'PASS' as const }] }, []).provedX).toBe(1)
  })
})

describe('GFMP defaults', () => {
  it('carries the NZ statutory bands', () => {
    expect(GFMP_DEFAULTS.FRIDGE).toMatchObject({ unit: '°C', readingMax: 5, criticalMax: 10 })
    expect(GFMP_DEFAULTS.FREEZER).toMatchObject({ unit: '°C', readingMax: -18, criticalMax: -12 })
    expect(GFMP_DEFAULTS.COOK.readingMin).toBe(75)
    expect(GFMP_DEFAULTS.HOT_HOLD.readingMin).toBe(60)
  })
  it('fridge defaults for a CHILLED linked item', () => {
    expect(gfmpDefaultFor('CHILLED')).toBe(GFMP_DEFAULTS.FRIDGE)
  })
  it('freezer defaults for a FROZEN linked item', () => {
    expect(gfmpDefaultFor('FROZEN')).toBe(GFMP_DEFAULTS.FREEZER)
  })
  it('falls back to probe calibration for AMBIENT/unset', () => {
    expect(gfmpDefaultFor('AMBIENT')).toBe(GFMP_DEFAULTS.PROBE_CAL)
    expect(gfmpDefaultFor(null)).toBe(GFMP_DEFAULTS.PROBE_CAL)
  })
})

describe('verdictLabel', () => {
  it('renders PASS / FAIL / dash', () => {
    expect(verdictLabel('PASS')).toBe('PASS')
    expect(verdictLabel('FAIL')).toBe('FAIL')
    expect(verdictLabel('NA')).toBe('—')
  })
})

describe('describeBand + readingAlertMessage', () => {
  it('renders a range with unit', () => {
    expect(describeBand({ readingMin: 0, readingMax: 5 }, '°C')).toBe('0–5°C')
  })
  it('renders single-sided bands', () => {
    expect(describeBand({ readingMin: 60 }, '°C')).toBe('≥ 60°C')
    expect(describeBand({ readingMax: 20 }, '°C')).toBe('≤ 20°C')
  })
  it('renders dash when no bounds', () => {
    expect(describeBand({}, '°C')).toBe('—')
  })
  it('builds the alert message', () => {
    expect(readingAlertMessage('FRIDGE 1', 8, { readingMin: 0, readingMax: 5 }, '°C')).toBe(
      'FRIDGE 1 recorded 8°C — expected 0–5°C',
    )
  })
})
