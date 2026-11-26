import { describe, expect, it } from 'vitest'
import { breachNoticePdfFilename } from './breach-notice-pdf'

describe('breachNoticePdfFilename', () => {
  it('uses a day-first date and strips unsafe plate characters', () => {
    expect(breachNoticePdfFilename('ab-123', '2026-11-01')).toBe(
      'BREACH NOTICE - AB123 - 01-11-2026.pdf',
    )
  })

  it('falls back safely for a non-standard date', () => {
    expect(breachNoticePdfFilename('', '')).toBe('BREACH NOTICE - NOTICE - DATE.pdf')
  })
})
