import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { StructureClient } from '@/components/admin/StructureClient'

function mockFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((url: string | URL | Request) => {
    const u = String(url)
    let body: unknown = { venues: [] }
    if (u.includes('/api/admin/structure')) {
      body = {
        venues: [{
          id: 'v1', name: 'MAIN',
          totals: { departments: 1, staff: 0, tasks: 1, training: 0 },
          departments: [{
            id: 'd1', name: 'BAR', colour: null, staff: [],
            tasks: [{ id: 't1', title: 'CLEAN', schedule: 'DAILY', active: true, scope: 'DEPARTMENT', assignee: null, links: [] }],
            training: [], sections: [],
          }],
          venueWide: { staff: [], tasks: [], training: [] },
        }],
      }
    }
    return Promise.resolve({ ok: true, json: async () => body } as Response)
  })
}

describe('StructureClient', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the STRUCTURE heading and EDIT MODE toggle', async () => {
    const { getByText } = render(<StructureClient role="ADMIN" />)
    expect(getByText('STRUCTURE')).toBeTruthy()
    await waitFor(() => expect(getByText('EDIT MODE')).toBeTruthy())
  })

  it('toggles edit mode on and shows the hint', async () => {
    const { getByText } = render(<StructureClient role="ADMIN" />)
    await waitFor(() => expect(getByText('EDIT MODE')).toBeTruthy())
    fireEvent.click(getByText('EDIT MODE'))
    expect(getByText('EDIT MODE: ON')).toBeTruthy()
    expect(getByText(/CLICK ANY STAFF, TASK OR TRAINING/)).toBeTruthy()
  })
})
