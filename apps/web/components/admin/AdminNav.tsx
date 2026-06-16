'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/structure', label: 'Structure' },
  { href: '/admin/calendar', label: 'Calendar' },
  { href: '/admin/notices', label: 'Notices' },
  { href: '/admin/venues', label: 'Venues' },
  { href: '/admin/departments', label: 'Departments' },
  { href: '/admin/staff', label: 'Staff' },
  { href: '/admin/tasks', label: 'Tasks' },
  { href: '/admin/templates', label: 'Templates' },
  { href: '/admin/training', label: 'Training' },
  { href: '/admin/qrcodes', label: 'QR Codes' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/budget', label: 'Budget' },
  { href: '/admin/review', label: 'Review' },
  { href: '/admin/settings', label: 'Settings' },
]

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 py-2 overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'block px-4 py-2.5 font-mono text-xs uppercase tracking-wider transition-colors border-l-4',
              isActive
                ? 'text-white border-l-white bg-black/30'
                : 'text-grey-light border-l-transparent hover:text-white hover:border-l-grey-mid'
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function Brand({ appName }: { appName: string }) {
  return (
    <div className="p-4 border-b border-grey-mid">
      <div className="font-mono font-bold text-sm uppercase tracking-widest text-white">{appName}</div>
      <div className="font-mono text-xs text-grey-light mt-0.5">ADMIN PANEL</div>
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

export function AdminNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'HOSPO OPS'

  // Close the drawer whenever the route changes.
  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 sticky top-0 h-screen bg-grey-dark border-r border-grey-mid flex-col">
        <Brand appName={appName} />
        <NavLinks pathname={pathname} />
        <SignOutButton />
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 z-40 bg-grey-dark border-b border-grey-mid flex items-center justify-between px-3">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="p-2 -ml-1 text-white hover:text-accent transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="font-mono font-bold text-sm uppercase tracking-widest text-white truncate">{appName}</div>
        <button
          onClick={() => signOut({ callbackUrl: '/admin/login' })}
          className="font-mono text-[10px] uppercase tracking-wider text-grey-light hover:text-danger transition-colors px-1"
        >
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
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="font-mono text-base leading-none text-grey-light hover:text-white transition-colors p-1"
              >
                ✕
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <SignOutButton />
          </aside>
        </div>
      )}
    </>
  )
}
