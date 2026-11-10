// Deterministic, template-driven supplier-invoice text parser. No PDF library
// here — text is extracted elsewhere. No Prisma imports.

export type InvoiceDateFormat = 'DMY' | 'MDY' | 'ISO'

export type InvoiceTemplateConfig = {
  header: {
    invoiceNumber?: string[]
    invoiceDate?: string[]
    dueDate?: string[]
    subtotal?: string[]
    gst?: string[]
    total?: string[]
  }
  lineRegion?: {
    start?: string
    end?: string
  }
  columns: {
    description: number
    sku?: number
    qty: number
    unitPrice: number
    lineTotal: number
  }
  dateFormat?: InvoiceDateFormat
  ignorePatterns?: string[]
}

export type ParsedInvoiceHeader = {
  invoiceNumber?: string
  invoiceDate?: string
  dueDate?: string
  subtotal?: number
  gst?: number
  total?: number
}

export type ParsedInvoiceLine = {
  description: string
  supplierSku?: string
  qty: number
  unitPrice: number
  lineTotal: number
}

export type ParsedInvoice = {
  header: ParsedInvoiceHeader
  lines: ParsedInvoiceLine[]
  issues: string[]
}

const DATE_FORMATS: InvoiceDateFormat[] = ['DMY', 'MDY', 'ISO']

export function validateTemplateConfig(config: InvoiceTemplateConfig): string[] {
  const errors: string[] = []

  if (!config || typeof config !== 'object') {
    return ['config must be an object']
  }

  const columns = config.columns
  if (!columns || typeof columns !== 'object') {
    errors.push('columns is required')
  } else {
    const required: Array<keyof InvoiceTemplateConfig['columns']> = [
      'description',
      'qty',
      'unitPrice',
      'lineTotal',
    ]
    for (const key of required) {
      const value = columns[key]
      if (!Number.isInteger(value) || (value as number) < 0) {
        errors.push(`columns.${key} must be a non-negative integer`)
      }
    }
    if (columns.sku !== undefined) {
      if (!Number.isInteger(columns.sku) || columns.sku < 0) {
        errors.push('columns.sku must be a non-negative integer')
      }
    }
  }

  if (config.dateFormat !== undefined && !DATE_FORMATS.includes(config.dateFormat)) {
    errors.push(`dateFormat must be one of ${DATE_FORMATS.join(', ')}`)
  }

  if (config.header && typeof config.header !== 'object') {
    errors.push('header must be an object')
  } else if (config.header) {
    for (const value of Object.values(config.header)) {
      if (value === undefined) continue
      if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
        errors.push('header anchors must be arrays of strings')
        break
      }
    }
  }

  if (config.lineRegion !== undefined) {
    if (!config.lineRegion || typeof config.lineRegion !== 'object') {
      errors.push('lineRegion must be an object')
    } else {
      const { start, end } = config.lineRegion
      if (start !== undefined && typeof start !== 'string') {
        errors.push('lineRegion.start must be a string')
      }
      if (end !== undefined && typeof end !== 'string') {
        errors.push('lineRegion.end must be a string')
      }
    }
  }

  if (
    config.ignorePatterns !== undefined &&
    (!Array.isArray(config.ignorePatterns) ||
      config.ignorePatterns.some((entry) => typeof entry !== 'string'))
  ) {
    errors.push('ignorePatterns must be an array of strings')
  }

  return errors
}

function parseMoney(raw: string | undefined): number | null {
  if (raw === undefined) return null
  let text = String(raw).trim()
  if (!text) return null
  text = text.replace(/[^0-9.,\-]/g, '')
  if (!text) return null

  const hasDot = text.includes('.')
  const hasComma = text.includes(',')

  if (hasDot && hasComma) {
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.')
    } else {
      text = text.replace(/,/g, '')
    }
  } else if (hasComma) {
    if (/,\d{2}$/.test(text)) {
      text = text.replace(/\./g, '').replace(',', '.')
    } else {
      text = text.replace(/,/g, '')
    }
  }

  const value = Number.parseFloat(text)
  return Number.isFinite(value) ? value : null
}

function parseQty(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const text = String(raw)
    .trim()
    .replace(/[^0-9.\-]/g, '')
  if (!text) return null
  const value = Number.parseFloat(text)
  return Number.isFinite(value) ? value : null
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function normaliseDate(raw: string, format: InvoiceDateFormat): string | null {
  const match = raw.match(/(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})/)
  if (!match) return null
  const first = Number.parseInt(match[1], 10)
  const second = Number.parseInt(match[2], 10)
  const third = Number.parseInt(match[3], 10)

  let year: number
  let month: number
  let day: number

  if (format === 'ISO' || match[1].length === 4) {
    year = first
    month = second
    day = third
  } else if (format === 'MDY') {
    month = first
    day = second
    year = third
  } else {
    day = first
    month = second
    year = third
  }

  if (year < 100) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function getLines(text: string): string[] {
  return text.split(/\r?\n/)
}

function findHeaderRest(lines: string[], anchors: string[] | undefined): string | null {
  if (!anchors || anchors.length === 0) return null
  const lowered = anchors.map((anchor) => anchor.toLowerCase()).filter(Boolean)
  if (!lowered.length) return null

  for (const line of lines) {
    const lower = line.toLowerCase()
    for (const anchor of lowered) {
      const index = lower.indexOf(anchor)
      if (index >= 0) return line.slice(index + anchor.length)
    }
  }
  return null
}

function firstMoney(rest: string | null): number | undefined {
  if (rest === null) return undefined
  const cleaned = rest.replace(/[^0-9.,\-]/g, ' ')
  const token = cleaned.split(/\s+/).find((part) => /\d/.test(part))
  if (!token) return undefined
  const value = parseMoney(token)
  return value === null ? undefined : value
}

function firstDate(rest: string | null, format: InvoiceDateFormat): string | undefined {
  if (rest === null) return undefined
  const match = rest.match(/\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}/)
  if (!match) return undefined
  const value = normaliseDate(match[0], format)
  return value ?? undefined
}

function firstToken(rest: string | null): string | undefined {
  if (rest === null) return undefined
  const trimmed = rest.replace(/^[\s:#\-]+/, '')
  if (!trimmed) return undefined
  const token = trimmed.split(/\t+| {2,}/)[0] ?? ''
  const value = token.trim()
  return value ? value : undefined
}

function splitColumns(line: string): string[] {
  return line
    .trim()
    .split(/\t+| {2,}/)
    .map((part) => part.trim())
}

export function parseInvoiceText(text: string, config: InvoiceTemplateConfig): ParsedInvoice {
  const lines = getLines(text ?? '')
  const issues: string[] = []

  const ignored = (config.ignorePatterns ?? []).map((pattern) => pattern.toLowerCase())
  const skipLine = (line: string): boolean => {
    const lower = line.toLowerCase()
    return ignored.some((pattern) => pattern && lower.includes(pattern))
  }

  const dateFormat: InvoiceDateFormat = config.dateFormat ?? 'DMY'

  const header: ParsedInvoiceHeader = {}
  const invoiceNumber = firstToken(findHeaderRest(lines, config.header?.invoiceNumber))
  if (invoiceNumber) header.invoiceNumber = invoiceNumber
  const invoiceDate = firstDate(findHeaderRest(lines, config.header?.invoiceDate), dateFormat)
  if (invoiceDate) header.invoiceDate = invoiceDate
  const dueDate = firstDate(findHeaderRest(lines, config.header?.dueDate), dateFormat)
  if (dueDate) header.dueDate = dueDate
  const subtotal = firstMoney(findHeaderRest(lines, config.header?.subtotal))
  if (subtotal !== undefined) header.subtotal = subtotal
  const gst = firstMoney(findHeaderRest(lines, config.header?.gst))
  if (gst !== undefined) header.gst = gst
  const total = firstMoney(findHeaderRest(lines, config.header?.total))
  if (total !== undefined) header.total = total

  let region = lines
  if (config.lineRegion?.start) {
    const anchor = config.lineRegion.start.toLowerCase()
    const index = region.findIndex((line) => line.toLowerCase().includes(anchor))
    if (index >= 0) region = region.slice(index + 1)
  }
  if (config.lineRegion?.end) {
    const anchor = config.lineRegion.end.toLowerCase()
    const index = region.findIndex((line) => line.toLowerCase().includes(anchor))
    if (index >= 0) region = region.slice(0, index)
  }

  const columns = config.columns
  const parsedLines: ParsedInvoiceLine[] = []

  region.forEach((line, index) => {
    if (!line.trim()) return
    if (skipLine(line)) return

    const cells = splitColumns(line)
    const maxIndex = Math.max(
      columns.description,
      columns.qty,
      columns.unitPrice,
      columns.lineTotal,
      columns.sku ?? 0,
    )
    if (cells.length <= maxIndex) {
      issues.push(`line ${index + 1}: not enough columns`)
      return
    }

    const description = (cells[columns.description] ?? '').trim()
    if (!description) {
      issues.push(`line ${index + 1}: missing description`)
      return
    }

    const qty = parseQty(cells[columns.qty])
    const unitPrice = parseMoney(cells[columns.unitPrice])
    const lineTotal = parseMoney(cells[columns.lineTotal])
    if (qty === null || unitPrice === null || lineTotal === null) {
      issues.push(`line ${index + 1}: could not parse numbers`)
      return
    }

    const parsed: ParsedInvoiceLine = { description, qty, unitPrice, lineTotal }
    if (columns.sku !== undefined) {
      const sku = (cells[columns.sku] ?? '').trim()
      if (sku) parsed.supplierSku = sku
    }
    parsedLines.push(parsed)
  })

  return { header, lines: parsedLines, issues }
}

export function buildInvoiceLearnPrompt(supplierName: string, sampleText: string): string {
  const name = String(supplierName ?? '').trim() || 'the supplier'
  return [
    `# LEARN INVOICE TEMPLATE — ${name}`,
    '',
    'You are configuring a deterministic invoice parser. Study the sample invoice',
    'text below and return **ONLY** a JSON object that matches the template shape.',
    'Do not add commentary, markdown fences, or extra keys.',
    '',
    '## Template shape',
    '```json',
    '{',
    '  "header": {',
    '    "invoiceNumber": ["INVOICE NO"],',
    '    "invoiceDate": ["INVOICE DATE"],',
    '    "dueDate": ["DUE DATE"],',
    '    "subtotal": ["SUBTOTAL"],',
    '    "gst": ["GST"],',
    '    "total": ["TOTAL"]',
    '  },',
    '  "lineRegion": { "start": "DESCRIPTION", "end": "TOTAL" },',
    '  "columns": { "description": 0, "sku": 1, "qty": 2, "unitPrice": 3, "lineTotal": 4 },',
    '  "dateFormat": "DMY",',
    '  "ignorePatterns": ["PAGE", "CONTINUED"]',
    '}',
    '```',
    '',
    'Notes:',
    '- `columns` indexes are zero-based positions when a line is split on 2+ spaces or tabs.',
    '- `lineRegion.start` / `end` are case-insensitive substrings; rows between them are parsed.',
    '- `dateFormat` is one of `DMY`, `MDY`, `ISO`.',
    '- `ignorePatterns` are rows to skip (headers, footers, page numbers).',
    '- Use the smallest set of anchors that uniquely identify each value.',
    '',
    '## Sample invoice text',
    '```',
    sampleText,
    '```',
    '',
    `Return ONLY the JSON object describing ${name}'s invoice layout.`,
  ].join('\n')
}
