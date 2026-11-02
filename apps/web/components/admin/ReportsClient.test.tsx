import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, screen } from '@testing-library/react'

import { ReportsClient } from '@/components/admin/ReportsClient'

function json(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as unknown as Response
}

function completion(id: string, outcome: string) {
  return {
    id,
    scheduledDate: '2026-10-20',
    completedAt: '2026-10-20T08:00:00.000Z',
    note: null,
    outcome,
    staff: { id: 's1', firstName: 'SAM', lastName: 'LEE' },
    task: {
      title: `TASK ${id}`,
      venue: { id: 'v1', name: 'VENUE' },
      department: { id: 'd1', name: 'KITCHEN', colour: null },
    },
  }
}

describe('ReportsClient', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.startsWith('/api/admin/reports')) {
        return json({
          completions: [completion('c1', 'DONE'), completion('c2', 'NOT_REQUIRED')],
          total: 1,
          recordsTotal: 2,
          pages: 1,
        })
      }
      if (u === '/api/admin/venues') return json([{ id: 'v1', name: 'VENUE' }])
      if (u === '/api/admin/departments') {
        return json([{ id: 'd1', name: 'KITCHEN', venueId: 'v1' }])
      }
      return json({})
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows an OUTCOME badge so non-DONE rows are distinguishable', async () => {
    render(<ReportsClient role="ADMIN" sessionVenueId="v1" defaultVenueId="v1" />)

    await waitFor(() => expect(screen.getByText('OUTCOME')).toBeDefined())
    await waitFor(() => expect(screen.getByText('NOT REQUIRED')).toBeDefined())
    expect(screen.getByText('DONE')).toBeDefined()
    expect(screen.getByText(/DONE ONLY/)).toBeDefined()
  })
})
