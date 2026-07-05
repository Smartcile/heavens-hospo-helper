import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import { BudgetPageClient } from '@/components/admin/BudgetPageClient'

describe('BudgetPageClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders without crashing with required props', () => {
    const { container } = render(
      <BudgetPageClient role="ADMIN" sessionVenueId="v1" year={2026} month={7} />
    )
    expect(container).toBeTruthy()
  })

  it('renders for MANAGER role', () => {
    const { container } = render(
      <BudgetPageClient role="MANAGER" sessionVenueId="v2" year={2026} month={1} />
    )
    expect(container).toBeTruthy()
  })
})
