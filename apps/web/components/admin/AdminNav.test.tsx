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

  it('renders the Heavenly Help link at the bottom', () => {
    renderNav()
    expect(linkHref('✕ HEAVENLY HELP')).toBe('/admin/help')
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
    expect(linkHref('Ops hub')).toBe('/admin/ops?tab=menu&sub=menus')
    expect(linkHref('Team & execution')).toBe('/admin/team?tab=staff')
    expect(linkHref('Compliance')).toBe('/admin/compliance?tab=tasks')
    expect(linkHref('Performance')).toBe('/admin/reports')
    expect(linkHref('Setup & config')).toBe('/admin/settings?tab=general')
    expect(linkHref('Events')).toBe('/admin/events?tab=enquiries')
    toggleGroup('Setup & config')
    expect(linkHref('Settings')).toBe('/admin/settings?tab=general')
    // Floor Plans moved under Events → Rooms & Plans.
    expect(linkHref('Floor Plans')).toBeNull()
    toggleGroup('Events')
    expect(linkHref('Enquiries')).toBe('/admin/events?tab=enquiries')
    expect(linkHref('Pipeline')).toBe('/admin/events?tab=pipeline')
    expect(linkHref('Block Library')).toBe('/admin/events?tab=library')
    expect(linkHref('Rooms & Plans')).toBe('/admin/events?tab=rooms')
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

  it('restricted manager with bookings sees Bookings, not Orders or Customers', () => {
    const { queryByText, getByText } = render(
      <AdminNav
        role="MANAGER"
        venueId="v1"
        defaultVenueId={undefined}
        availableVenueIds={[]}
        grantedAreas={['bookings']}
      />,
    )
    expect(getByText('Ops hub')).toBeTruthy()
    toggleGroup('Ops hub')
    expect(getByText('Bookings')).toBeTruthy()
    expect(queryByText('Orders')).toBeNull()
    expect(queryByText('Customers')).toBeNull()
    expect(queryByText('Menu & Services')).toBeNull()
    expect(queryByText('Inventory & Stocktake')).toBeNull()
  })

  it('restricted manager with events sees every events-area item', () => {
    const { queryByText, getByText } = render(
      <AdminNav
        role="MANAGER"
        venueId="v1"
        defaultVenueId={undefined}
        availableVenueIds={[]}
        grantedAreas={['events']}
      />,
    )
    expect(getByText('Events')).toBeTruthy()
    toggleGroup('Events')
    for (const label of ['Enquiries', 'BEO Planner', 'Pipeline', 'Event Templates', 'Requests', 'Block Library']) {
      expect(getByText(label)).toBeTruthy()
    }
    // Rooms & Plans is gated by the floorplans area, not events.
    expect(queryByText('Rooms & Plans')).toBeNull()
  })

  it('restricted manager with floorplans sees Rooms & Plans only', () => {
    const { queryByText, getByText } = render(
      <AdminNav
        role="MANAGER"
        venueId="v1"
        defaultVenueId={undefined}
        availableVenueIds={[]}
        grantedAreas={['floorplans']}
      />,
    )
    toggleGroup('Events')
    expect(getByText('Rooms & Plans')).toBeTruthy()
    expect(queryByText('Enquiries')).toBeNull()
    // The group header must follow the only visible item, not the static default.
    expect(linkHref('Events')).toBe('/admin/events?tab=rooms')
  })

  it('a filtered group header never points at an ungranted page', () => {
    render(
      <AdminNav
        role="MANAGER"
        venueId="v1"
        defaultVenueId={undefined}
        availableVenueIds={[]}
        grantedAreas={['bookings']}
      />,
    )
    // The header follows the first visible item, never an ungranted page.
    expect(linkHref('Ops hub')).toBe('/admin/ops?tab=bookings')
    expect(linkHref('Ops hub')).not.toBe('/admin/ops?tab=menu&sub=menus')
  })

  it('Settings and Overview stay visible with an empty grant set', () => {
    const { queryByText, getByText } = render(
      <AdminNav
        role="MANAGER"
        venueId="v1"
        defaultVenueId={undefined}
        availableVenueIds={[]}
        grantedAreas={[]}
      />,
    )
    expect(getByText('Dashboard')).toBeTruthy()
    expect(getByText('Setup & config')).toBeTruthy()
    expect(linkHref('Dashboard')).toBe('/admin')
    expect(queryByText('Ops hub')).toBeNull()
    expect(queryByText('Events')).toBeNull()
    // Dashboard is the default-open group.
    expect(getByText('Overview')).toBeTruthy()
    expect(queryByText('Calendar')).toBeNull()
    toggleGroup('Setup & config')
    expect(getByText('Settings')).toBeTruthy()
  })

  it('shows everything when grantedAreas is omitted (legacy behaviour)', () => {
    const { getByText } = renderNav()
    expect(getByText('Ops hub')).toBeTruthy()
    expect(getByText('Events')).toBeTruthy()
    expect(getByText('Performance')).toBeTruthy()
    expect(getByText('Setup & config')).toBeTruthy()
  })
})
