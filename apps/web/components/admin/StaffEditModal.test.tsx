import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { StaffEditModal } from '@/components/admin/StaffEditModal'

function mockFetch() {
  return vi.spyOn(global, 'fetch').mockImplementation((url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    let body: unknown = []
    if (/\/api\/admin\/staff\/[^/]+$/.test(u) && (init?.method ?? 'GET') === 'GET') {
      body = {
        id: 's1', firstName: 'JANE', lastName: 'SMITH', email: null, role: 'STAFF', venueId: 'v1',
        departmentId: null, isActive: true, hourlyRate: null, employmentType: null,
        swiftPosId: null, myHrId: null, loadedReportsId: null, sections: [],
        positions: [{ positionId: 'p1', hourlyRate: 30 }],
      }
    } else if (u.includes('/api/admin/venues')) {
      body = [{ id: 'v1', name: 'MAIN' }]
    } else if (u.includes('/api/admin/positions')) {
      body = [{ id: 'p1', name: 'BARISTA', venueId: 'v1', hourlyRate: 25 }]
    }
    return Promise.resolve({ ok: true, json: async () => body } as Response)
  })
}

describe('StaffEditModal', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders loading then the loaded staff member (no hook-order crash)', async () => {
    const { getByText, getByDisplayValue } = render(
      <StaffEditModal staffId="s1" role="ADMIN" onClose={() => {}} onSaved={() => {}} />
    )
    expect(getByText('LOADING')).toBeTruthy()
    await waitFor(() => expect(getByDisplayValue('JANE')).toBeTruthy())
  })

  it('shows the EDIT STAFF title', () => {
    const { getByText } = render(
      <StaffEditModal staffId="s1" role="MANAGER" onClose={() => {}} onSaved={() => {}} />
    )
    expect(getByText('EDIT STAFF')).toBeTruthy()
  })

  it('loads held positions with their rate and saves them without wiping the role', async () => {
    const spy = mockFetch()
    const { getByText, getAllByText, getByDisplayValue } = render(
      <StaffEditModal staffId="s1" role="ADMIN" onClose={() => {}} onSaved={() => {}} />
    )

    await waitFor(() => expect(getByDisplayValue('JANE')).toBeTruthy())
    expect(getAllByText('BARISTA').length).toBeGreaterThan(0)
    // The stored per-role override is surfaced in the rate input.
    await waitFor(() => expect(getByDisplayValue('30')).toBeTruthy())

    fireEvent.click(getByText('SAVE'))
    await waitFor(() => {
      const put = spy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')
      expect(put).toBeDefined()
      const body = JSON.parse((put![1] as RequestInit).body as string)
      expect(body.positions).toEqual([{ positionId: 'p1', hourlyRate: 30 }])
      expect(body.positionIds).toBeUndefined()
    })
  })
})
