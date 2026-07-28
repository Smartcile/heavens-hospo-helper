import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { StaffEditModal } from '@/components/admin/StaffEditModal'

function mockFetch() {
  vi.spyOn(global, 'fetch').mockImplementation((url: string | URL | Request) => {
    const u = String(url)
    let body: unknown = []
    if (/\/api\/admin\/staff\/[^/]+$/.test(u)) {
      body = {
        id: 's1', firstName: 'JANE', lastName: 'SMITH', email: null, role: 'STAFF', venueId: 'v1',
        departmentId: null, isActive: true, hourlyRate: null, employmentType: null,
        swiftPosId: null, myHrId: null, loadedReportsId: null, sections: [],
      }
    } else if (u.includes('/api/admin/venues')) {
      body = [{ id: 'v1', name: 'MAIN' }]
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
})
