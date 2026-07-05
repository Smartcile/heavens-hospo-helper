import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/venues',
}))

import { AdminNav } from '@/components/admin/AdminNav'

describe('AdminNav', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders without crashing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<AdminNav />)
    expect(container).toBeTruthy()
  })

  it('renders navigation group labels', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getByText } = render(<AdminNav />)
    expect(getByText('Organisation')).toBeTruthy()
    expect(getByText('Overview')).toBeTruthy()
  })
})
