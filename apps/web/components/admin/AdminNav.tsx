'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { VenueSwitcher } from '@/components/admin/VenueSwitcher'
import version from '@/version.json'

interface NavItem { href: string; label: string; exact?: boolean }
interface NavGroup { label: string; items: NavItem[]; href?: string }

// Nav item → permission area. Items without a mapping are always visible.
const NAV_ITEM_AREAS: Record<string, string> = {
  '/admin/calendar': 'calendar',
  '/w/kitchen': 'orders',
  '/admin/ops?tab=menu': 'ops',
  '/admin/ops?tab=bookings': 'ops',
  '/admin/ops?tab=orders': 'ops',
  '/admin/ops?tab=customers': 'ops',
  '/admin/ops?tab=inventory': 'ops',
  '/admin/events?tab=events': 'events',
  '/admin/events?tab=templates': 'events',
  '/admin/events?tab=requests': 'events',
  '/admin/team': 'team',
  '/admin/execution': 'execution',
  '/admin/training': 'training',
  '/admin/notices': 'notices',
  '/admin/compliance': 'compliance',
  '/admin/reports': 'performance',
  '/admin/budget': 'performance',
  '/admin/gift-cards': 'performance',
  '/admin/settings?tab=floorplans': 'floorplans',
}

const NAV_GROUPS: NavGroup[] = [
  { label: 'Dashboard', href: '/admin', items: [
    { href: '/admin', label: 'Overview', exact: true },
    { href: '/admin/calendar', label: 'Calendar' },
    { href: '/w/kitchen', label: 'Kitchen' },
  ] },
  // Every group header deep-links to its first subpage (incl. the default
  // sub-tab where one exists); the ▸/▾ button beside it still collapses.
  { label: 'Ops hub', href: '/admin/ops?tab=menu&sub=recipes', items: [
    { href: '/admin/ops?tab=menu', label: 'Menu & Services' },
    { href: '/admin/ops?tab=bookings', label: 'Bookings' },
    { href: '/admin/ops?tab=orders', label: 'Orders' },
    { href: '/admin/ops?tab=customers', label: 'Customers' },
    { href: '/admin/ops?tab=inventory', label: 'Inventory & Stocktake' },
  ] },
  { label: 'Events', href: '/admin/events?tab=events', items: [
    { href: '/admin/events?tab=events', label: 'BEO Planner' },
    { href: '/admin/events?tab=templates', label: 'Event Templates' },
    { href: '/admin/events?tab=requests', label: 'Requests' },
  ] },
  { label: 'Team & execution', href: '/admin/team?tab=staff', items: [
    { href: '/admin/team', label: 'Roster & Pay' },
    { href: '/admin/execution', label: 'Daily Tasks' },
    { href: '/admin/training', label: 'Training' },
    { href: '/admin/notices', label: 'Notices' },
  ] },
  { label: 'Compliance', href: '/admin/compliance?tab=tasks', items: [
    { href: '/admin/compliance', label: 'Food Safety' },
  ] },
  { label: 'Performance', href: '/admin/reports', items: [
    { href: '/admin/reports', label: 'Reports' },
    { href: '/admin/budget', label: 'Budget' },
    { href: '/admin/gift-cards', label: 'Gift Cards' },
  ] },
  { label: 'Setup & config', href: '/admin/settings?tab=general', items: [
    { href: '/admin/settings?tab=floorplans', label: 'Floor Plans' },
    { href: '/admin/settings?tab=general', label: 'Settings' },
  ] },
]

function hrefBase(href: string) {
  const i = href.indexOf('?')
  return i === -1 ? href : href.slice(0, i)
}

// Query-carrying hrefs (the five ops areas) match against pathname + search
// so only the area whose ?tab= is current lights up.
function isItemActive(item: NavItem, pathname: string, location: string) {
  if (item.href.includes('?')) return location.startsWith(item.href)
  return item.exact ? pathname === item.href : pathname.startsWith(item.href)
}

// Group headers deep-link to their first subpage (?tab=…): active when the
// current location falls under that link or the bare path is visited (e.g.
// /admin/ops typed without params still opens the Ops hub group). Plain-href
// groups keep exact-path matching so /admin never claims /admin/venues.
function isGroupActive(href: string, pathname: string, location: string) {
  if (href.includes('?')) return location.startsWith(href) || pathname === hrefBase(href)
  return pathname === href
}

function groupForPath(pathname: string, location: string): string | null {
  // Find the last (most specific) matching group — avoids /admin
  // matching both Overview and Venue when path is /admin/venues.
  const match = [...NAV_GROUPS].reverse().find((grp) =>
    grp.items.some((it) => isItemActive(it, pathname, location)) ||
    (grp.href && isGroupActive(grp.href, pathname, location))
  )
  return match?.label ?? null
}

function ItemLink({ item, pathname, location, onNavigate }: { item: NavItem; pathname: string; location: string; onNavigate?: () => void }) {
  const active = isItemActive(item, pathname, location)
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        'block pl-6 pr-4 py-2 font-mono text-xs uppercase tracking-wider transition-colors border-l-4',
        active
          ? 'text-white border-l-white bg-black/30'
          : 'text-grey-light border-l-transparent hover:text-white hover:border-l-grey-mid'
      )}
    >
      {item.label}
    </Link>
  )
}

function NavGroups({
  groups,
  pathname,
  location,
  openGroups,
  toggleGroup,
  onNavigate,
}: {
  groups: NavGroup[]
  pathname: string
  location: string
  openGroups: Set<string>
  toggleGroup: (label: string) => void
  onNavigate?: () => void
}) {
  return (
    <nav className="flex-1 py-2 overflow-y-auto">
      {groups.map((group) => {
        const open = openGroups.has(group.label)
        const hasActive = group.items.some((it) => isItemActive(it, pathname, location))
          || (group.href ? isGroupActive(group.href, pathname, location) : false)
        return (
          <div key={group.label} className="mb-1">
            {group.href ? (
              <div className="flex items-center">
                <Link
                  href={group.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex-1 px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors',
                    hasActive ? 'text-white' : 'text-grey-light hover:text-white'
                  )}
                >
                  {group.label}
                </Link>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="px-2 py-2 text-grey-light hover:text-white font-mono text-xs"
                >
                  {open ? '▾' : '▸'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors',
                  hasActive ? 'text-white' : 'text-grey-light hover:text-white'
                )}
              >
                <span>{group.label}</span>
                <span className="text-grey-light">{open ? '▾' : '▸'}</span>
              </button>
            )}
            {open && group.items.map((item) => (
              <ItemLink key={item.href} item={item} pathname={pathname} location={location} onNavigate={onNavigate} />
            ))}
          </div>
        )
      })}
    </nav>
  )
}

function Brand({ appName, role, venueId, defaultVenueId, availableVenueIds }: { appName: string; role: string; venueId: string; defaultVenueId: string | null | undefined; availableVenueIds: string[] }) {
  return (
    <div className="border-b border-grey-mid">
      <div className="p-4">
        <div className="font-mono font-bold text-sm uppercase tracking-widest text-white">{appName}</div>
        <div className="font-mono text-xs text-grey-light mt-0.5">ADMIN PANEL <span className="text-grey-light/50">0.1.{version.build}</span></div>
      </div>
      <VenueSwitcher role={role} venueId={venueId} defaultVenueId={defaultVenueId} availableVenueIds={availableVenueIds} />
    </div>
  )
}

function SignOutButton() {
  return (
    <div className="p-4 border-t border-grey-mid">
      <button
        onClick={() => signOut({ callbackUrl: '/' })}
        className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors tracking-wider"
      >
        SIGN OUT
      </button>
    </div>
  )
}

export function AdminNav({ role, venueId, defaultVenueId, availableVenueIds, grantedAreas }: { role: string; venueId: string; defaultVenueId: string | null | undefined; availableVenueIds: string[]; grantedAreas?: string[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  // Query-carrying hrefs (the ops areas) are matched against pathname+search.
  const location = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const active = groupForPath(pathname, location)
    return new Set(active ? [active] : [NAV_GROUPS[0].label])
  })
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'HOSPO OPS'

  // Restricted managers only see nav items whose area is granted.
  const visibleGroups = useMemo(
    () =>
      grantedAreas
        ? NAV_GROUPS.map((group) => ({
            ...group,
            items: group.items.filter(
              (item) => !NAV_ITEM_AREAS[item.href] || grantedAreas.includes(NAV_ITEM_AREAS[item.href]),
            ),
          })).filter((group) => group.items.length > 0)
        : NAV_GROUPS,
    [grantedAreas],
  )

  // Close the mobile drawer on route change, and ensure the active group is open.
  useEffect(() => {
    setOpen(false)
    const active = groupForPath(pathname, location)
    if (active) setOpenGroups(new Set([active]))
  }, [pathname, location])

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      if (prev.has(label)) return new Set() // close if already open
      return new Set([label])                // open only this one
    })
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 sticky top-0 h-screen bg-grey-dark border-r border-grey-mid flex-col">
        <Brand appName={appName} role={role} venueId={venueId} defaultVenueId={defaultVenueId} availableVenueIds={availableVenueIds} />
        <NavGroups groups={visibleGroups} pathname={pathname} location={location} openGroups={openGroups} toggleGroup={toggleGroup} />
        <SignOutButton />
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 z-40 bg-grey-dark border-b border-grey-mid flex items-center justify-between px-3">
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="p-2 -ml-1 text-white hover:text-accent transition-colors">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="font-mono font-bold text-sm uppercase tracking-widest text-white truncate">{appName}</div>
        <button onClick={() => signOut({ callbackUrl: '/' })} className="font-mono text-[10px] uppercase tracking-wider text-grey-light hover:text-danger transition-colors px-1">
          EXIT
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 h-full w-64 bg-grey-dark border-r border-grey-mid flex flex-col shadow-2xl">
            <Brand appName={appName} role={role} venueId={venueId} defaultVenueId={defaultVenueId} availableVenueIds={availableVenueIds} />
            <NavGroups groups={visibleGroups} pathname={pathname} location={location} openGroups={openGroups} toggleGroup={toggleGroup} onNavigate={() => setOpen(false)} />
            <SignOutButton />
          </aside>
        </div>
      )}
    </>
  )
}
