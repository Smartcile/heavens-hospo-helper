'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { VenueSwitcher } from '@/components/admin/VenueSwitcher'

interface NavItem { href: string; label: string; exact?: boolean }
interface NavGroup { label: string; items: NavItem[]; href?: string }

const NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', href: '/admin', items: [
    { href: '/admin', label: 'Dashboard', exact: true },
    { href: '/admin/structure', label: 'Structure' },
    { href: '/admin/calendar', label: 'Calendar' },
  ] },
  { label: 'Venue', href: '/admin/venues', items: [
    { href: '/admin/staff', label: 'Staff' },
    { href: '/admin/suppliers', label: 'Suppliers' },
    { href: '/admin/uoms', label: 'Units of Measure' },
  ] },
  { label: 'Operations', items: [
    { href: '/admin/stocktake', label: 'Stocktake' },
    { href: '/admin/inventory', label: 'Inventory' },
    { href: '/admin/recipes', label: 'Recipes & Menu Items' },
    { href: '/admin/orders', label: 'Orders' },
  ] },
  { label: 'Work', items: [
    { href: '/admin/tasks', label: 'Tasks & Checklists' },
    { href: '/admin/training', label: 'Training & SOPs' },
    { href: '/admin/qrcodes', label: 'QR Codes' },
  ] },
  { label: 'Daily ops', items: [
    { href: '/admin/notices', label: 'Notices' },
    { href: '/admin/review', label: 'Review' },
    { href: '/admin/followups', label: 'Follow-ups' },
  ] },
  { label: 'Finance', items: [
    { href: '/admin/budget', label: 'Budget' },
    { href: '/admin/payroll', label: 'Payroll' },
    { href: '/admin/reports', label: 'Reports' },
    { href: '/admin/gift-cards', label: 'Gift Cards' },
  ] },
]

const SETTINGS_ITEM: NavItem = { href: '/admin/settings', label: 'Settings' }

function isItemActive(item: NavItem, pathname: string) {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href)
}

function groupForPath(pathname: string): string | null {
  // Find the last (most specific) matching group — avoids /admin
  // matching both Overview and Venue when path is /admin/venues.
  const match = [...NAV_GROUPS].reverse().find((grp) =>
    grp.items.some((it) => isItemActive(it, pathname)) ||
    (grp.href && pathname.startsWith(grp.href))
  )
  return match?.label ?? null
}

function ItemLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = isItemActive(item, pathname)
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
  pathname,
  openGroups,
  toggleGroup,
  onNavigate,
}: {
  pathname: string
  openGroups: Set<string>
  toggleGroup: (label: string) => void
  onNavigate?: () => void
}) {
  return (
    <nav className="flex-1 py-2 overflow-y-auto">
      {NAV_GROUPS.map((group) => {
        const open = openGroups.has(group.label)
        const hasActive = group.items.some((it) => isItemActive(it, pathname))
          || (group.href ? pathname === group.href : false)
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
              <ItemLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
            ))}
          </div>
        )
      })}
      <div className="mt-1 border-t border-grey-mid pt-1">
        <ItemLink item={SETTINGS_ITEM} pathname={pathname} onNavigate={onNavigate} />
      </div>
    </nav>
  )
}

function Brand({ appName, role, venueId, defaultVenueId }: { appName: string; role: string; venueId: string; defaultVenueId: string | null | undefined }) {
  return (
    <div className="border-b border-grey-mid">
      <div className="p-4">
        <div className="font-mono font-bold text-sm uppercase tracking-widest text-white">{appName}</div>
        <div className="font-mono text-xs text-grey-light mt-0.5">ADMIN PANEL</div>
      </div>
      <VenueSwitcher role={role} venueId={venueId} defaultVenueId={defaultVenueId} />
    </div>
  )
}

function SignOutButton() {
  return (
    <div className="p-4 border-t border-grey-mid">
      <button
        onClick={() => signOut({ callbackUrl: '/admin/login' })}
        className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors tracking-wider"
      >
        SIGN OUT
      </button>
    </div>
  )
}

export function AdminNav({ role, venueId, defaultVenueId }: { role: string; venueId: string; defaultVenueId: string | null | undefined }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const active = groupForPath(pathname)
    return new Set(active ? [active] : [NAV_GROUPS[0].label])
  })
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'HOSPO OPS'

  // Close the mobile drawer on route change, and ensure the active group is open.
  useEffect(() => {
    setOpen(false)
    const active = groupForPath(pathname)
    if (active) setOpenGroups(new Set([active]))
  }, [pathname])

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
        <Brand appName={appName} role={role} venueId={venueId} defaultVenueId={defaultVenueId} />
        <NavGroups pathname={pathname} openGroups={openGroups} toggleGroup={toggleGroup} />
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
        <button onClick={() => signOut({ callbackUrl: '/admin/login' })} className="font-mono text-[10px] uppercase tracking-wider text-grey-light hover:text-danger transition-colors px-1">
          EXIT
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute left-0 top-0 h-full w-64 bg-grey-dark border-r border-grey-mid flex flex-col shadow-2xl">
            <div className="p-4 border-b border-grey-mid flex items-start justify-between">
              <div>
                <div className="font-mono font-bold text-sm uppercase tracking-widest text-white">{appName}</div>
                <div className="font-mono text-xs text-grey-light mt-0.5">ADMIN PANEL</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="font-mono text-base leading-none text-grey-light hover:text-white transition-colors p-1">✕</button>
            </div>
            <NavGroups pathname={pathname} openGroups={openGroups} toggleGroup={toggleGroup} onNavigate={() => setOpen(false)} />
            <SignOutButton />
          </aside>
        </div>
      )}
    </>
  )
}
