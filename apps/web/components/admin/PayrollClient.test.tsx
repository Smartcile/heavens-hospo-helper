import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { PayrollClient } from '@/components/admin/PayrollClient'

describe('PayrollClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders heading', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)

    const { findByText } = render(<PayrollClient role="ADMIN" sessionVenueId="v1" />)
    const heading = await findByText('TIME CLOCK')
    expect(heading).toBeDefined()
  })

  it('shows view toggles and manual entry button', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)

    const { findByText } = render(<PayrollClient role="ADMIN" sessionVenueId="v1" />)
    const byDay = await findByText('BY DAY')
    const byPerson = await findByText('BY PERSON')
    const manual = await findByText('+ MANUAL ENTRY')
    expect(byDay).toBeDefined()
    expect(byPerson).toBeDefined()
    expect(manual).toBeDefined()
  })
})
