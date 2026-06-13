'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', exact: true },
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

export function AdminNav() {
  const pathname = usePathname()

  return (
    <aside className="w-56 min-h-screen bg-grey-dark border-r border-grey-mid flex flex-col">
      <div className="p-4 border-b border-grey-mid">
        <div className="font-mono font-bold text-sm uppercase tracking-widest text-white">
          {process.env.NEXT_PUBLIC_APP_NAME ?? 'HOSPO OPS'}
        </div>
        <div className="font-mono text-xs text-grey-light mt-0.5">ADMIN PANEL</div>
      </div>

      <nav className="flex-1 py-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
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

      <div className="p-4 border-t border-grey-mid">
        <button
          onClick={() => signOut({ callbackUrl: '/admin/login' })}
          className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors tracking-wider"
        >
          SIGN OUT
        </button>
      </div>
    </aside>
  )
}
