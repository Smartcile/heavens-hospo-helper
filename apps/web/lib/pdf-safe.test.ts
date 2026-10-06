import { describe, it, expect } from 'vitest'
import { pdfSafe } from '@/lib/pdf-safe'

describe('pdfSafe', () => {
  it('maps arrows and bullets the built-in font cannot draw', () => {
    expect(pdfSafe('CASH TIPS → TIP JAR')).toBe('CASH TIPS -> TIP JAR')
    expect(pdfSafe('▪ GUIDE LINK')).toBe('- GUIDE LINK')
    expect(pdfSafe('60°C')).toBe('60 degC')
  })

  it('maps smart punctuation to ASCII', () => {
    expect(pdfSafe('Don’t “hold back” — ever…')).toBe('Don\'t "hold back" - ever...')
  })

  it('keeps printable ASCII untouched', () => {
    expect(pdfSafe('STEP 1 - CASH TIPS (x2)')).toBe('STEP 1 - CASH TIPS (x2)')
  })

  it('replaces any other unsupported glyph with a placeholder', () => {
    expect(pdfSafe('emoji \u{1F600}')).toBe('emoji ?')
  })
})
