// Minimal RFC-4180-ish CSV reader. Handles quoted fields, escaped quotes,
// CRLF/LF and a UTF-8 BOM. No dependency and safe on both server and client.

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

export function parseCsvRows(text: string): string[][] {
  const input = stripBom(text)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch === '\r') {
      // Consume CRLF as one line ending.
      if (input[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

/** Parse a CSV with a header row into header-keyed records. */
export function parseCsv(text: string): ParsedCsv {
  const rows = parseCsvRows(text)
  if (rows.length === 0) return { headers: [], rows: [] }
  const headers = rows[0].map((h) => h.trim())
  const records: Record<string, string>[] = []
  for (const cells of rows.slice(1)) {
    // Skip fully blank lines.
    if (cells.every((c) => c.trim() === '')) continue
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      if (header) record[header] = cells[index] ?? ''
    })
    records.push(record)
  }
  return { headers, rows: records }
}

/** Write one CSV field, quoting only when needed. */
export function csvField(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value)
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n')
}
