'use client'

import type { BudgetMathResultWithBreakdowns, DailyBudgetWithBreakdowns } from '@/lib/budget-math'

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

interface AllocationEntry {
  categoryId: string
  budgetDayId: string
  amount: number
  note: string
}

interface BreakdownCategory {
  id: string
  name: string
  departmentId: string
  percentage: number
}

interface Props {
  result: BudgetMathResultWithBreakdowns
  allocations: AllocationEntry[]
  revenueCategoryId: string
  breakdownCategories: BreakdownCategory[]
  onAllocationChange: (dayId: string, categoryId: string, amount: number, note: string) => void
}

function money(n: number) {
  return n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
}

function moneyExact(n: number) {
  return n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  date.setUTCDate(date.getUTCDate() + 3 - (date.getUTCDay() || 7))
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  firstThu.setUTCDate(firstThu.getUTCDate() + 3 - (firstThu.getUTCDay() || 7))
  return Math.round((date.getTime() - firstThu.getTime()) / 86400000 / 7) + 1
}

interface WeekGroup {
  weekNumber: number
  label: string
  days: DailyBudgetWithBreakdowns[]
}

export function BudgetDailyGrid({
  result,
  allocations,
  revenueCategoryId,
  breakdownCategories,
  onAllocationChange,
}: Props) {
  function getAllocAmount(dayId: string, categoryId: string): number {
    return allocations.find((a) => a.budgetDayId === dayId && a.categoryId === categoryId)?.amount ?? 0
  }

  const hasAnyAllocations = allocations.length > 0
  const hasGeneratedResult = result.allocations.length > 0

  if (!hasGeneratedResult) {
    return (
      <p className="font-mono text-xs text-grey-light py-8">
        SET UP CATEGORIES AND DAILY WEIGHTS, THEN CLICK GENERATE GRID.
      </p>
    )
  }

  const weeks: WeekGroup[] = []
  for (const day of result.allocations) {
    const dateObj = new Date(day.date)
    const weekNo = getISOWeek(dateObj)
    const last = weeks[weeks.length - 1]
    if (last && last.weekNumber === weekNo) {
      last.days.push(day)
    } else {
      weeks.push({ weekNumber: weekNo, label: '', days: [day] })
    }
  }

  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

  for (const week of weeks) {
    const first = new Date(week.days[0].date)
    const last = new Date(week.days[week.days.length - 1].date)
    week.label = `WEEK ${weeks.indexOf(week) + 1} — ${DOW[first.getUTCDay()]} ${first.getUTCDate()} ${MONTHS[first.getUTCMonth()]} TO ${DOW[last.getUTCDay()]} ${last.getUTCDate()} ${MONTHS[last.getUTCMonth()]}`
  }

  function buildBreakdownText(revenue: number): string {
    if (breakdownCategories.length === 0 || revenue <= 0) return ''
    const parts: string[] = []
    let total = 0
    for (const cat of breakdownCategories) {
      if (cat.percentage <= 0) continue
      const amt = Math.round(revenue * (cat.percentage / 100))
      parts.push(`${cat.name}: ${moneyExact(amt)}`)
      total += amt
    }
    const rem = revenue - total
    if (rem > 0 || breakdownCategories.some((c) => c.percentage <= 0)) {
      parts.push(`REMAINDER: ${moneyExact(Math.max(0, rem))}`)
    }
    return parts.join(' | ')
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {weeks.map((week) => (
        <div key={week.weekNumber} className="border border-grey-mid">
          <div className="px-3 py-1.5 bg-grey-dark/30 border-b border-grey-mid flex items-center justify-between">
            <span className="font-mono text-xs uppercase text-grey-light tracking-wider">{week.label}</span>
            <span className="font-mono text-xs text-white">
              {money(week.days.reduce((sum, day) => sum + (day.isWorkingDay ? (hasAnyAllocations ? getAllocAmount(day.dayId, revenueCategoryId) : day.revenue) : 0), 0))}
            </span>
          </div>
          <div className="divide-y divide-grey-mid">
            {week.days.map((day) => {
              const weekend = day.dayOfWeek === 0 || day.dayOfWeek === 6
              const dateObj = new Date(day.date)
              const dayNum = dateObj.getUTCDate()
              const revenue = hasAnyAllocations ? getAllocAmount(day.dayId, revenueCategoryId) : day.revenue
              const breakdownText = buildBreakdownText(revenue)

              return (
                <div key={day.dayId} className={`${!day.isWorkingDay ? 'opacity-40' : ''} ${weekend ? 'bg-black/20' : ''}`}>
                  <div className="px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-white w-6 text-right">{dayNum}</span>
                      <span className="font-mono text-xs text-grey-light w-8">{DOW[day.dayOfWeek]}</span>
                      {!day.isWorkingDay ? (
                        <span className="font-mono text-xs text-grey-light">NON-WORKING</span>
                      ) : (
                        <input
                          type="number"
                          value={revenue || ''}
                          onChange={(e) => onAllocationChange(day.dayId, revenueCategoryId, Number(e.target.value), '')}
                          className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 w-32 outline-none focus:border-white"
                        />
                      )}
                    </div>
                    {day.isWorkingDay && breakdownText && (
                      <div className="pl-14">
                        <span className="font-mono text-xs text-grey-light break-all">{breakdownText}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
