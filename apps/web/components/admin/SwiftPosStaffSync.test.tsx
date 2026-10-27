import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SwiftPosStaffSync } from '@/components/admin/SwiftPosStaffSync'

vi.mock('@/components/ui/Toast', () => ({ pushToast: vi.fn() }))

const PAYLOAD = {
  venueName: 'DEMO',
  baseUrl: 'http://swift:5080',
  rows: [
    { clerkId: '1', name: 'Jane Doe', status: 'LINKED', staffId: 's1', staffName: 'JANE DOE', suggestedStaffId: null },
    { clerkId: '2', name: 'John Smith', status: 'SUGGESTED', staffId: null, staffName: null, suggestedStaffId: 's2' },
    { clerkId: '3', name: 'Alice Brown', status: 'NEW', staffId: null, staffName: null, suggestedStaffId: null },
  ],
  staff: [
    { id: 's1', firstName: 'JANE', lastName: 'DOE', swiftPosId: '1', isActive: true },
    { id: 's2', firstName: 'JOHN', lastName: 'SMITH', swiftPosId: null, isActive: true },
    { id: 's3', firstName: 'ALICE', lastName: 'BROWN', swiftPosId: null, isActive: true },
  ],
}

let posts: Record<string, unknown>[] = []

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    const u = String(url)
    const json = (d: unknown, status = 200) =>
      Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(d) })
    if (u.startsWith('/api/admin/swiftpos/staff') && init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)))
      return json({ ok: true, staff: PAYLOAD.staff[0] }, 201)
    }
    if (u.startsWith('/api/admin/swiftpos/staff')) return json(PAYLOAD)
    return json(null)
  }) as unknown as typeof fetch
}

describe('SwiftPosStaffSync', () => {
  beforeEach(() => {
    posts = []
    globalThis.fetch = mockFetch()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('shows clerks, links a suggested staff member and creates a new profile', async () => {
    render(<SwiftPosStaffSync venueId="v1" />)

    await waitFor(() => expect(screen.getByText('SWIFTPOS STAFF')).toBeTruthy())
    expect(screen.getAllByText('LINKED').length).toBeGreaterThan(0)
    expect(screen.getByText('SUGGESTED')).toBeTruthy()
    expect(screen.getByText('NEW')).toBeTruthy()
    expect(screen.getAllByText('JANE DOE').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByLabelText('LINK CLERK 2'))
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toMatchObject({ action: 'LINK', clerkId: '2', staffId: 's2', venueId: 'v1' })

    await waitFor(() => expect(screen.getByLabelText('CREATE STAFF FOR CLERK 3')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('CREATE STAFF FOR CLERK 3'))
    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[1]).toMatchObject({ action: 'CREATE', clerkId: '3', pin: '3', venueId: 'v1' })

    fireEvent.click(screen.getByLabelText('UNLINK CLERK 1'))
    await waitFor(() => expect(posts).toHaveLength(3))
    expect(posts[2]).toMatchObject({ action: 'UNLINK', clerkId: '1', staffId: 's1', venueId: 'v1' })
  })

  it('shows the server error when SwiftDOSnet is not configured', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'SWIFTPOS NOT CONNECTED — SET THE SWIFTDOSNET URL ON THE VENUE' }),
    })) as unknown as typeof fetch

    render(<SwiftPosStaffSync venueId="v1" />)
    await waitFor(() => expect(screen.getByText(/SWIFTPOS NOT CONNECTED/)).toBeTruthy())
  })
})
