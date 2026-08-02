import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BudgetImportModal } from '@/components/admin/BudgetImportModal'

const MONTHS = ['JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY']
const ROWS = [
  { label: 'Eatery - Beverage', kind: 'LINE', depth: 2, values: [46993, 35790], sectionId: null, include: true },
  { label: 'Eatery Gross Margin %', kind: 'SKIP', depth: 0, values: [0.72], sectionId: null, include: false },
  { label: 'Total Eatery Revenue', kind: 'TOTAL', depth: 2, values: [185256, 186689], sectionId: null, include: true },
]

describe('BudgetImportModal', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/import')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ months: MONTHS, year: 2026, rows: ROWS }),
        } as Response)
      }
      if (url.endsWith('/import/commit')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ totalLines: 24, createdPeriods: 12, skippedPeriods: 0 }),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })
    vi.spyOn(global, 'fetch').mockImplementation(fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the file picker when open', () => {
    render(<BudgetImportModal isOpen onClose={() => {}} venueId="v1" year={2026} sections={[]} onDone={() => {}} />)
    expect(screen.getByText(/UPLOAD A .XLSX P&L BUDGET/)).toBeTruthy()
    expect(screen.getByDisplayValue('2026')).toBeTruthy()
  })

  it('parses a file into a preview with include toggles', async () => {
    render(<BudgetImportModal isOpen onClose={() => {}} venueId="v1" year={2026} sections={[]} onDone={() => {}} />)
    const file = { name: 'eatery.xlsx', size: 100, arrayBuffer: async () => new ArrayBuffer(16) } as File
    fireEvent.change(screen.getByLabelText(/YEAR/), { target: { value: '2026' } })
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    })

    expect(await screen.findByText(/12 MONTHS DETECTED/)).toBeTruthy()
    expect(screen.getByDisplayValue('Eatery - Beverage')).toBeTruthy()
    // 2 of 3 rows importable (SKIP row excluded)
    expect(screen.getByText(/2 OF 3 ROWS WILL IMPORT/)).toBeTruthy()
    expect(screen.getByText('IMPORT 2 ROWS × 12 MONTHS')).toBeTruthy()
  })

  it('commits the parsed rows and reports the result', async () => {
    const onDone = vi.fn()
    render(<BudgetImportModal isOpen onClose={() => {}} venueId="v1" year={2026} sections={[]} onDone={onDone} />)
    const file = { name: 'eatery.xlsx', size: 100, arrayBuffer: async () => new ArrayBuffer(16) } as File
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    })
    await screen.findByText(/12 MONTHS DETECTED/)

    fireEvent.click(screen.getByText('IMPORT 2 ROWS × 12 MONTHS'))
    await waitFor(() => {
      const commit = fetchMock.mock.calls.find(([, init]) => String(init?.url ?? '').endsWith('/commit') || String(init?.body ?? '').includes('"months"'))
      expect(commit).toBeTruthy()
    })
    await waitFor(() => {
      expect(onDone).toHaveBeenCalledWith(expect.stringContaining('IMPORTED 24 LINES'))
    })
  })

  it('shows the parse error when the workbook is rejected', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/import')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'No month columns found' }),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    })
    render(<BudgetImportModal isOpen onClose={() => {}} venueId="v1" year={2026} sections={[]} onDone={() => {}} />)
    const file = { name: 'bad.xlsx', size: 100, arrayBuffer: async () => new ArrayBuffer(16) } as File
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    })
    expect(await screen.findByText('No month columns found')).toBeTruthy()
  })
})
