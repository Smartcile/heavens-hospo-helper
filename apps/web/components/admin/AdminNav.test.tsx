import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  pathname: '/admin/venues',
  search: new URLSearchParams(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => mocks.search,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// Stub window.location.reload for VenueSwitcher
Object.defineProperty(window, 'location', {
  value: { reload: vi.fn() },
  writable: true,
})

import { AdminNav } from '@/components/admin/AdminNav'

const props = { role: 'ADMIN', venueId: 'v1', defaultVenueId: undefined, availableVenueIds: [] as string[] }

// Every group header is now a link with a ▸/▾ button beside it.
function toggleGroup(label: string) {
  const link = Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent === label) as HTMLAnchorElement
  const toggle = link.parentElement!.querySelector('button') as HTMLButtonElement
  fireEvent.click(toggle)
}

function linkHref(label: string): string | null {
  const link = Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent === label)
  return link?.getAttribute('href') ?? null
}

function itemActive(label: string): boolean {
  const link = Array.from(document.body.querySelectorAll('a')).find((a) => a.textContent === label)
  return link?.className.includes('border-l-white') ?? false
}

function renderNav(overrides: Partial<typeof props> = {}, role: 'ADMIN' | 'MANAGER' = 'ADMIN') {
  return render(<AdminNav {...props} {...overrides} role={role} />)
}

describe('AdminNav', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    mocks.pathname = '/admin/venues'
    mocks.search = new URLSearchParams()
    document.body.innerHTML = ''
  })

  it('renders without crashing', () => {
    const { container } = renderNav()
    expect(container).toBeTruthy()
  })

  it('renders navigation group labels', () => {
    const { getByText } = renderNav()
    expect(getByText('Dashboard')).toBeTruthy()
    expect(getByText('Ops hub')).toBeTruthy()
    expect(getByText('Team & execution')).toBeTruthy()
    expect(getByText('Setup & config')).toBeTruthy()
  })

  it('group headers deep-link to their first subpage (with the default sub-tab)', () => {
    renderNav()
    expect(linkHref('Dashboard')).toBe('/admin')
    expect(linkHref('Ops hub')).toBe('/admin/ops?tab=menu&sub=recipes')
    expect(linkHref('Team & execution')).toBe('/admin/team?tab=staff')
    expect(linkHref('Compliance')).toBe('/admin/compliance?tab=tasks')
    expect(linkHref('Performance')).toBe('/admin/reports')
    expect(linkHref('Setup & config')).toBe('/admin/settings?tab=general')
    toggleGroup('Setup & config')
    expect(linkHref('Settings')).toBe('/admin/settings?tab=general')
    expect(linkHref('Floor Plans')).toBe('/admin/settings?tab=floorplans')
  })

  it('renders the five ops areas as sidebar items once the group opens', () => {
    renderNav()
    toggleGroup('Ops hub')
    for (const label of ['Menu & Services', 'Bookings', 'Orders', 'Customers', 'Inventory & Stocktake']) {
      expect(document.body.textContent).toContain(label)
    }
  })

  it('only the area whose ?tab= is current lights up', () => {
    mocks.pathname = '/admin/ops'
    mocks.search = new URLSearchParams('tab=bookings')
    renderNav()
    const active = Array.from(document.body.querySelectorAll('a')).filter((a) => a.className.includes('border-l-white'))
    expect(active).toHaveLength(1)
    expect(active[0].textContent).toBe('Bookings')
  })

  it('a bare /admin/ops path still opens the Ops hub group (no item highlighted)', () => {
    mocks.pathname = '/admin/ops'
    renderNav()
    expect(document.body.textContent).toContain('Menu & Services')
    expect(document.body.textContent).toContain('Bookings')
    expect(itemActive('Menu & Services')).toBe(false)
  })

  it('hides groups whose areas are not granted when grantedAreas is provided', () => {
    const { queryByText, getByText } = render(
      <AdminNav
        role="MANAGER"
        venueId="v1"
        defaultVenueId={undefined}
        availableVenueIds={[]}
        grantedAreas={['compliance', 'bookings']}
      />,
    )
    expect(getByText('Compliance')).toBeTruthy()
    expect(queryByText('Ops hub')).toBeNull() // all five ops items map to `ops` — not granted
    expect(queryByText('Performance')).toBeNull()
    expect(getByText('Setup & config')).toBeTruthy() // Settings stays ungated (venue settings)
    expect(getByText('Dashboard')).toBeTruthy() // Overview stays ungated
  })

  it('shows everything when grantedAreas is omitted (legacy behaviour)', () => {
    const { getByText } = renderNav()
    expect(getByText('Ops hub')).toBeTruthy()
    expect(getByText('Performance')).toBeTruthy()
    expect(getByText('Setup & config')).toBeTruthy()
  })
})
