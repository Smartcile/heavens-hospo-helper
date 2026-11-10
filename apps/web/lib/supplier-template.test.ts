import { describe, expect, it } from 'vitest'
import {
  describeTemplateStatus,
  nextTemplateVersion,
  normaliseTemplateConfig,
  templateFingerprint,
} from './supplier-template'

describe('normaliseTemplateConfig', () => {
  it('coerces string column indexes and drops junk', () => {
    const config = normaliseTemplateConfig({
      header: { invoiceNumber: ['INVOICE NO', '', 42], total: 'not-an-array' },
      columns: { description: '0', sku: '1', qty: '2', unitPrice: '3', lineTotal: '4' },
      dateFormat: 'MDY',
      ignorePatterns: ['PAGE', ''],
    })
    expect(config.columns).toEqual({ description: 0, sku: 1, qty: 2, unitPrice: 3, lineTotal: 4 })
    expect(config.header.invoiceNumber).toEqual(['INVOICE NO'])
    expect(config.header.total).toBeUndefined()
    expect(config.dateFormat).toBe('MDY')
    expect(config.ignorePatterns).toEqual(['PAGE'])
  })

  it('falls back to sane required columns and drops an invalid date format', () => {
    const config = normaliseTemplateConfig({
      columns: { description: 'x', qty: -1 },
      lineRegion: { start: 'DESC', end: '' },
      dateFormat: 'NOPE',
    })
    expect(config.columns).toEqual({ description: 0, qty: 1, unitPrice: 2, lineTotal: 3 })
    expect(config.dateFormat).toBeUndefined()
    expect(config.lineRegion).toEqual({ start: 'DESC' })
  })

  it('handles a non-object input', () => {
    const config = normaliseTemplateConfig(null)
    expect(config.columns.description).toBe(0)
    expect(config.header).toEqual({})
  })
})

describe('templateFingerprint', () => {
  it('is stable for the same text regardless of case and outer whitespace', () => {
    expect(templateFingerprint('  HELLO WORLD  ')).toBe(templateFingerprint('hello world'))
  })

  it('changes when the text changes', () => {
    expect(templateFingerprint('INVOICE A')).not.toBe(templateFingerprint('INVOICE B'))
  })
})

describe('nextTemplateVersion', () => {
  it('starts at 1 for no versions', () => {
    expect(nextTemplateVersion([])).toBe(1)
  })

  it('increments past the highest existing version', () => {
    expect(nextTemplateVersion([1, 3, 2])).toBe(4)
  })
})

describe('describeTemplateStatus', () => {
  it('describes ACTIVE and DRAFT', () => {
    expect(describeTemplateStatus('ACTIVE')).toContain('ACTIVE')
    expect(describeTemplateStatus('DRAFT')).toContain('DRAFT')
    expect(describeTemplateStatus('weird')).toContain('WEIRD')
  })
})
