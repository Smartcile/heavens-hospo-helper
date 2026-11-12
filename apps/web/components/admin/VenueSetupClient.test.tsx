import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VenueSetupClient } from '@/components/admin/VenueSetupClient'

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)
}

describe('VenueSetupClient', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn((url: string) => {
      const u = String(url)
      if (u.startsWith('/api/admin/positions/readiness')) return json({})
      if (u.startsWith('/api/admin/positions')) return json([])
      if (u.startsWith('/api/admin/departments')) return json([])
      if (u.startsWith('/api/admin/sections')) return json([])
      if (u.startsWith('/api/admin/venues')) return json([])
      return json(null)
    }) as unknown as typeof fetch
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the SECTIONS panel after DEPARTMENTS', async () => {
    render(<VenueSetupClient role="MANAGER" sessionVenueId="v1" defaultVenueId="v1" />)

    const departments = await screen.findByText('DEPARTMENTS', { selector: 'h1' })
    const sections = await screen.findByText('SECTIONS', { selector: 'h1' })

    expect(departments.compareDocumentPosition(sections) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/DEPARTMENTS · SECTIONS · ROLES/)).toBeTruthy()
  })

  it('renders the sections empty state (the block is mounted)', async () => {
    render(<VenueSetupClient role="MANAGER" sessionVenueId="v1" defaultVenueId="v1" />)

    expect(await screen.findByText('NO SECTIONS YET. ADD ONE UNDER A DEPARTMENT.')).toBeTruthy()
    expect(screen.getByText('+ NEW SECTION')).toBeTruthy()
  })
})
