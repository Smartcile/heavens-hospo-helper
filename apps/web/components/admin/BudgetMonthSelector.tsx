'use client'

import { useRouter } from 'next/navigation'
import { Select } from '@/components/ui/Select'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// Same look as the global DateNav strip (roster/orders/clocks) — but months
// only, since a budget lives on exactly one calendar month.
const NAV_LINK = 'font-mono text-2xs uppercase tracking-wider text-grey-light hover:text-white'

interface Venue {
  id: string
  name: string
}

interface Props {
  year: number
  month: number
  role: string
  venues: Venue[]
  selectedVenueId: string
  onVenueChange: (vid: string) => void
}

export function BudgetMonthSelector({
  year,
  month,
  role,
  venues,
  selectedVenueId,
  onVenueChange,
}: Props) {
  const router = useRouter()

  function goTo(y: number, m: number) {
    router.push(`/admin/budget/${y}/${m}`)
  }

  function shiftMonths(delta: number) {
    const total = year * 12 + (month - 1) + delta
    goTo(Math.floor(total / 12), (total % 12) + 1)
  }

  const venueOptions = [
    { value: '', label: 'SELECT VENUE' },
    ...venues.map((v) => ({ value: v.id, label: v.name })),
  ]

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">BUDGET</h1>
        {role === 'ADMIN' && (
          <div className="w-48">
            <Select
              value={selectedVenueId}
              onChange={(e) => onVenueChange(e.target.value)}
              options={venueOptions}
              placeholder="VENUE"
              className="text-xs"
            />
          </div>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-4 flex-wrap">
        <span className="font-mono text-xl font-bold uppercase tracking-wide text-white">
          {MONTHS[month - 1]} {year}
        </span>
        <div className="flex items-center gap-4">
          <button className={NAV_LINK} onClick={() => goTo(year - 1, month)}>
            &lt;&lt; YEAR
          </button>
          <button className={NAV_LINK} onClick={() => shiftMonths(-1)}>
            &lt; MONTH
          </button>
          <button
            className={`${NAV_LINK} text-white`}
            onClick={() => {
              const now = new Date()
              goTo(now.getFullYear(), now.getMonth() + 1)
            }}
          >
            THIS MONTH
          </button>
          <button className={NAV_LINK} onClick={() => shiftMonths(1)}>
            MONTH &gt;
          </button>
          <button className={NAV_LINK} onClick={() => goTo(year + 1, month)}>
            YEAR &gt;&gt;
          </button>
        </div>
      </div>
    </div>
  )
}
