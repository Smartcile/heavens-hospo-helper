import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BudgetLinesPanel } from '@/components/admin/BudgetLinesPanel'

const LINES = [
  { id: 'g1', name: 'REVENUE', kind: 'GROUP', parentId: null, sectionId: null, amount: null, total: null },
  { id: 'l1', name: 'BEVERAGE', kind: 'LINE', parentId: 'g1', sectionId: null, amount: 100, total: null },
  { id: 'l2', name: 'FOOD', kind: 'LINE', parentId: 'g1', sectionId: 's1', amount: 250, total: null },
  { id: 't1', name: 'TOTAL REVENUE', kind: 'TOTAL', parentId: 'g1', sectionId: null, amount: null, total: null },
]

const SECTIONS = [{ id: 's1', name: 'BAR', departmentId: 'd1' }]

describe('BudgetLinesPanel', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/admin/budget-lines?')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ period: { id: 'p1', totalBudget: 0 }, lines: LINES, sections: SECTIONS }),
        } as Response)
      }
      return Promise.resolve({ ok: true, json: async () => ({ line: {} }) } as Response)
    })
    vi.spyOn(global, 'fetch').mockImplementation(fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the line tree with computed TOTAL and venue total', async () => {
    render(<BudgetLinesPanel venueId="v1" year={2026} month={6} />)
    expect(await screen.findByDisplayValue('BEVERAGE')).toBeTruthy()
    expect(screen.getByDisplayValue('FOOD')).toBeTruthy()
    expect(screen.getByDisplayValue('TOTAL REVENUE')).toBeTruthy()
    // TOTAL row sum (100 + 250) and the VENUE TOTAL both show $350
    expect(screen.getAllByText('$350')).toHaveLength(2)
    expect(screen.getByText('4 LINES')).toBeTruthy()
  })

  it('shows the empty state when no lines exist', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ period: null, lines: [], sections: [] }),
      } as Response)
    )
    render(<BudgetLinesPanel venueId="v1" year={2026} month={6} />)
    expect(await screen.findByText('NO P&L LINES FOR THIS MONTH.')).toBeTruthy()
  })

  it('renders section options in the filter and row selects', async () => {
    render(<BudgetLinesPanel venueId="v1" year={2026} month={6} />)
    await screen.findByDisplayValue('BEVERAGE')
    expect(screen.getAllByRole('option', { name: 'BAR' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('option', { name: 'ALL SECTIONS' })).toBeTruthy()
  })

  it('opens the import modal', async () => {
    render(<BudgetLinesPanel venueId="v1" year={2026} month={6} />)
    await screen.findByDisplayValue('BEVERAGE')
    fireEvent.click(screen.getByText('⇩ IMPORT FROM EXCEL'))
    expect(screen.getByText('IMPORT P&L BUDGET FROM EXCEL')).toBeTruthy()
  })

  it('posts a new LINE on add and reloads', async () => {
    render(<BudgetLinesPanel venueId="v1" year={2026} month={6} />)
    await screen.findByDisplayValue('BEVERAGE')
    const getCallsBefore = fetchMock.mock.calls.filter(([, init]) => !init || init.method === undefined).length

    fireEvent.click(screen.getByText('+ ADD LINE'))
    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([, init]) => init?.method === 'POST' && String(init.body).includes('"kind":"LINE"')
      )
      expect(post).toBeTruthy()
    })
    // a fresh GET fired after the POST
    await waitFor(() => {
      const getCallsAfter = fetchMock.mock.calls.filter(([, init]) => !init || init.method === undefined).length
      expect(getCallsAfter).toBeGreaterThan(getCallsBefore)
    })
  })
})
