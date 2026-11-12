import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

import { RosterTemplatesModal } from '@/components/admin/RosterTemplatesModal'

interface FetchCall { url: string; init?: RequestInit }

function mockFetch(handler: (call: FetchCall) => unknown) {
  const spy = vi.spyOn(global, 'fetch')
  spy.mockImplementation(async (input, init) => {
    const call = { url: String(input), init: init ?? undefined }
    return { ok: true, json: async () => handler(call) } as Response
  })
  return spy
}

const templates = {
  templates: [
    {
      id: 't1',
      name: 'SUMMER WEEK',
      notes: 'BUSY',
      createdAt: '2026-11-09T00:00:00Z',
      shifts: [
        { id: 'ts1', staffId: 's1', staffName: 'JANE SMITH', positionName: 'BARISTA', dayIndex: 0, startTime: '09:00', endTime: '17:00', breakMinutes: 30 },
      ],
    },
  ],
}

afterEach(() => vi.restoreAllMocks())

describe('RosterTemplatesModal', () => {
  it('lists saved templates with shift and staff detail', async () => {
    mockFetch(({ url }) => (url.includes('/templates?') ? templates : {}))
    render(<RosterTemplatesModal venueId="v1" weekStart="2026-11-09" onClose={vi.fn()} onApplied={vi.fn()} />)

    expect(await screen.findByText('ROSTER TEMPLATES')).toBeDefined()
    expect(await screen.findByText('SUMMER WEEK')).toBeDefined()
    expect(screen.getByText('1 SHIFT · BUSY')).toBeDefined()
    expect(screen.getByText(/MON 09:00–17:00 · JANE SMITH/)).toBeDefined()
  })

  it('saves the current week as a template', async () => {
    const spy = mockFetch(({ url }) => (url.includes('/templates?') ? { templates: [] } : { shifts: 3 }))
    render(<RosterTemplatesModal venueId="v1" weekStart="2026-11-09" onClose={vi.fn()} onApplied={vi.fn()} />)
    await screen.findByText('NO TEMPLATES YET.')

    fireEvent.change(screen.getByPlaceholderText('SUMMER WEEK'), { target: { value: 'WEEK 2' } })
    fireEvent.click(screen.getByText('SAVE AS TEMPLATE'))

    await waitFor(() => {
      const call = spy.mock.calls.find(([url]) => String(url) === '/api/admin/roster/templates')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]!.body))).toMatchObject({ venueId: 'v1', name: 'WEEK 2', start: '2026-11-09' })
    })
    expect(await screen.findByText('SAVED — 3 SHIFTS')).toBeDefined()
  })

  it('applies a template to the target week', async () => {
    const spy = mockFetch(({ url }) => {
      if (url.includes('/templates?')) return templates
      if (url.includes('/apply')) return { created: 5, replaced: 2, skippedStaffIds: ['gone'] }
      return {}
    })
    const onApplied = vi.fn()
    render(<RosterTemplatesModal venueId="v1" weekStart="2026-11-09" onClose={vi.fn()} onApplied={onApplied} />)
    await screen.findByText('SUMMER WEEK')

    // The target week defaults to the week after the one being viewed.
    expect(screen.getByDisplayValue('2026-11-16')).toBeDefined()
    fireEvent.click(screen.getByText('APPLY'))

    await waitFor(() => {
      const call = spy.mock.calls.find(([url]) => String(url) === '/api/admin/roster/templates/t1/apply')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]!.body))).toMatchObject({ venueId: 'v1', weekStart: '2026-11-16', mode: 'ADD' })
    })
    expect(await screen.findByText('APPLIED SUMMER WEEK — 5 CREATED · 2 REPLACED · 1 STAFF SKIPPED')).toBeDefined()
    expect(onApplied).toHaveBeenCalled()
  })

  it('asks for confirmation before a REPLACE apply and does nothing when cancelled', async () => {
    const spy = mockFetch(({ url }) => {
      if (url.includes('/templates?')) return templates
      if (url.includes('/apply')) return { created: 1 }
      return {}
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<RosterTemplatesModal venueId="v1" weekStart="2026-11-09" onClose={vi.fn()} onApplied={vi.fn()} />)
    await screen.findByText('SUMMER WEEK')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'REPLACE' } })
    fireEvent.click(screen.getByText('APPLY'))

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('INCLUDING PUBLISHED SHIFTS'))
    expect(spy.mock.calls.some(([url]) => String(url) === '/api/admin/roster/templates/t1/apply')).toBe(false)
  })

  it('applies in REPLACE mode after confirmation', async () => {
    const spy = mockFetch(({ url }) => {
      if (url.includes('/templates?')) return templates
      if (url.includes('/apply')) return { created: 1 }
      return {}
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<RosterTemplatesModal venueId="v1" weekStart="2026-11-09" onClose={vi.fn()} onApplied={vi.fn()} />)
    await screen.findByText('SUMMER WEEK')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'REPLACE' } })
    fireEvent.click(screen.getByText('APPLY'))

    await waitFor(() => {
      const call = spy.mock.calls.find(([url]) => String(url) === '/api/admin/roster/templates/t1/apply')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call![1]!.body))).toMatchObject({ mode: 'REPLACE' })
    })
  })
})
