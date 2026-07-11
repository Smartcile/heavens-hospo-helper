'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ORG_ITEMS = [
  { href: '/admin/venues', label: 'Venue', exact: true },
]

export function OrgTabs() {
  const pathname = usePathname()

  return (
    <div className="flex border-b border-grey-mid overflow-x-auto">
      {ORG_ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'font-mono text-xs uppercase px-4 py-2 border-b-2 transition-colors flex-shrink-0',
              active
                ? 'text-white border-b-white'
                : 'text-grey-light border-b-transparent hover:text-white hover:border-b-grey-mid'
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </div>
  )
}
