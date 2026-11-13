import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StaffPlatesPanel } from './StaffPlatesPanel'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

const DATA = {
  requests: [
    {
      id: 'r1',
      staffId: 's1',
      plate: 'NEW99',
      previousPlate: 'OLD1',
      reason: 'new car',
      status: 'PENDING',
      reviewNote: null,
      createdAt: '2026-11-12T09:00:00.000Z',
      staff: { firstName: 'ALEX', lastName: 'SMITH' },
    },
  ],
  plates: [
    {
      id: 'p1',
      staffId: 's1',
      plate: 'OLD1',
      status: 'ACTIVE',
      enteredInSystem: false,
      approvedAt: '2026-11-01T09:00:00.000Z',
      createdAt: '2026-11-01T09:00:00.000Z',
      staff: { firstName: 'ALEX', lastName: 'SMITH' },
    },
  ],
  counts: { pending: 1, toEnter: 1, active: 1 },
  timezone: 'Pacific/Auckland',
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/review')) return jsonResponse({ ok: true })
    if (init?.method === 'PATCH') return jsonResponse({ plate: DATA.plates[0] })
    return jsonResponse(DATA)
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StaffPlatesPanel', () => {
  it('lists a pending request with its reason and staff name', async () => {
    render(<StaffPlatesPanel venueId="v1" />)
    expect(await screen.findByText(/ALEX SMITH · NEW99/)).toBeInTheDocument()
    expect(screen.getByText(/REASON: new car/)).toBeInTheDocument()
    expect(screen.getByText(/1 TO APPROVE/)).toBeInTheDocument()
  })

  it('approves a request with a note', async () => {
    render(<StaffPlatesPanel venueId="v1" />)
    await screen.findByText(/ALEX SMITH · NEW99/)

    fireEvent.change(screen.getByPlaceholderText('NOTE (OPTIONAL)'), {
      target: { value: 'checked' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'APPROVE' }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes('/review') && (init as RequestInit)?.method === 'POST',
        ),
      ).toBe(true),
    )
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/review'))
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      action: 'APPROVE',
      note: 'checked',
    })
  })

  it('ticks a plate as entered', async () => {
    render(<StaffPlatesPanel venueId="v1" />)
    await screen.findByText(/ALEX SMITH · NEW99/)

    fireEvent.click(screen.getByRole('button', { name: 'TO ENTER (1)' }))
    fireEvent.click(screen.getByRole('checkbox'))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes('/staff-plates/p1') &&
            (init as RequestInit)?.method === 'PATCH',
        ),
      ).toBe(true),
    )
    const call = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/staff-plates/p1') && (init as RequestInit)?.method === 'PATCH',
    )
    expect(JSON.parse(String((call?.[1] as RequestInit).body))).toEqual({
      enteredInSystem: true,
    })
  })
})
