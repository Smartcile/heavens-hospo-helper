import { describe, expect, it } from 'vitest'
import { csvField, parseCsv, parseCsvRows, toCsv } from './csv'

describe('csv', () => {
  it('parses quoted commas, escaped quotes and CRLF', () => {
    const text = 'Name,Note\r\n"Smith, Jane","Said ""hello"""\r\n"Plain",ok\r\n'
    const parsed = parseCsv(text)
    expect(parsed.headers).toEqual(['Name', 'Note'])
    expect(parsed.rows).toEqual([
      { Name: 'Smith, Jane', Note: 'Said "hello"' },
      { Name: 'Plain', Note: 'ok' },
    ])
  })

  it('strips a BOM and skips blank lines', () => {
    const parsed = parseCsv('\uFEFFA,B\n1,2\n,\n3,4\n')
    expect(parsed.rows).toEqual([
      { A: '1', B: '2' },
      { A: '3', B: '4' },
    ])
  })

  it('handles a trailing newline and a quoted newline', () => {
    const rows = parseCsvRows('A,B\n"line\none",2\n')
    expect(rows).toEqual([
      ['A', 'B'],
      ['line\none', '2'],
    ])
  })

  it('quotes only fields that need it', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField(' trailing ')).toBe('" trailing "')
    expect(toCsv([['A', 'B'], ['1', '2']])).toBe('A,B\r\n1,2')
  })
})
