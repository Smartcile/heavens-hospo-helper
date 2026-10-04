import { describe, it, expect } from 'vitest'
import { filenameFromDisposition } from '@/lib/download-file'

describe('filenameFromDisposition', () => {
  it('reads a quoted filename', () => {
    expect(filenameFromDisposition('attachment; filename="GUIDE - FOOD SAFETY.pdf"')).toBe('GUIDE - FOOD SAFETY.pdf')
  })

  it('reads an unquoted filename', () => {
    expect(filenameFromDisposition('attachment; filename=roster.pdf')).toBe('roster.pdf')
  })

  it('prefers the RFC 5987 UTF-8 form and decodes it', () => {
    expect(filenameFromDisposition("attachment; filename*=UTF-8''Caf%C3%A9%20Menu.pdf")).toBe('Café Menu.pdf')
  })

  it('returns null when there is no filename or header', () => {
    expect(filenameFromDisposition(null)).toBeNull()
    expect(filenameFromDisposition('attachment')).toBeNull()
  })
})
