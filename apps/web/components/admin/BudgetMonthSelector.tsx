'use client'

import { useRouter } from 'next/navigation'
import { Select } from '@/components/ui/Select'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

interface Venue {
  id: string
  name: string
}

interface Props {
  year: number
  month: number
  variant: 'grid' | 'compact'
  role: string
  venues: Venue[]
  selectedVenueId: string
  onVenueChange: (vid: string) => void
}

export function BudgetMonthSelector({
  year,
  month,
  variant,
  role,
  venues,
  selectedVenueId,
  onVenueChange,
}: Props) {
  const router = useRouter()

  function goTo(y: number, m: number) {
    router.push(`/admin/budget/${y}/${m}`)
  }

  function prevMonth() {
    if (month === 1) goTo(year - 1, 12)
    else goTo(year, month - 1)
  }

  function nextMonth() {
    if (month === 12) goTo(year + 1, 1)
    else goTo(year, month + 1)
  }

  const venueOptions = [
    { value: '', label: 'SELECT VENUE' },
    ...venues.map((v) => ({ value: v.id, label: v.name })),
  ]

  if (variant === 'compact') {
    return (
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
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
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors"
          >
            ←
          </button>
          <span className="font-mono text-sm uppercase text-white font-bold">
            {MONTHS[month - 1]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-white hover:border-white transition-colors"
          >
            →
          </button>
          <button
            onClick={() => router.push('/admin/budget')}
            className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-grey-light hover:text-white hover:border-white transition-colors"
          >
            VIEW ALL MONTHS
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-3">
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => goTo(year - 1, 1)}
            className="font-mono text-xs uppercase border border-grey-mid px-2 py-1 text-grey-light hover:text-white hover:border-white transition-colors"
          >
            ◀ {year - 1}
          </button>
          <span className="font-mono text-lg text-white font-bold">{year}</span>
          <button
            onClick={() => goTo(year + 1, 1)}
            className="font-mono text-xs uppercase border border-grey-mid px-2 py-1 text-grey-light hover:text-white hover:border-white transition-colors"
          >
            {year + 1} ▶
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span></span>
        <span className="font-mono text-xs uppercase text-grey-light">
          {MONTHS[month - 1]} {year}
        </span>
        <span></span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {MONTHS.map((m, i) => {
          const mNum = i + 1
          const isCurrent = mNum === month && year === new Date().getFullYear()
          return (
            <button
              key={m}
              onClick={() => goTo(year, mNum)}
              className={`font-mono text-xs uppercase py-4 border transition-colors ${
                isCurrent
                  ? 'border-white bg-white text-black font-bold'
                  : 'border-grey-mid text-grey-light hover:text-white hover:border-white'
              }`}
            >
              {m}
            </button>
          )
        })}
      </div>
    </div>
  )
}
