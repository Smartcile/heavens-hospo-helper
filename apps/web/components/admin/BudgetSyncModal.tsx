'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

interface Props {
  isOpen: boolean
  onClose: () => void
  venueId: string
  year: number
  breakdownCategories: { name: string; departmentId: string; percentage: number }[]
  onSynced: (message: string) => void
}

export function BudgetSyncModal({ isOpen, onClose, venueId, year, breakdownCategories, onSynced }: Props) {
  const [existingMonths, setExistingMonths] = useState<Set<number>>(new Set())
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !venueId) return
    setSelected(new Set())
    fetch(`/api/admin/budget?venueId=${venueId}&year=${year}&listMonths=1`)
      .then((r) => r.json())
      .then((data: { months: number[] }) => {
        setExistingMonths(new Set(data.months ?? []))
      })
      .catch(() => setExistingMonths(new Set()))
  }, [isOpen, venueId, year])

  function toggle(month: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(month)) next.delete(month)
      else next.add(month)
      return next
    })
  }

  function selectAll() { setSelected(new Set(MONTH_NAMES.map((_, i) => i + 1))) }
  function deselectAll() { setSelected(new Set()) }

  async function handleSync() {
    if (selected.size === 0) return
    setLoading(true)
    const r = await fetch('/api/admin/budget/sync-breakdowns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId,
        year,
        targetMonths: Array.from(selected).sort((a, b) => a - b),
        sourceCategories: breakdownCategories.map((c) => ({
          name: c.name, departmentId: c.departmentId || null, percentage: c.percentage,
        })),
      }),
    })
    setLoading(false)
    if (r.ok) {
      const d = await r.json()
      const created = d.created ?? 0
      const updated = (d.syncedPeriods ?? 0) - created
      let msg = `SYNCED ${d.syncedPeriods} MONTHS`
      if (created > 0) msg += ` (${created} NEW)`
      onSynced(msg)
      onClose()
    } else {
      onSynced('SYNC FAILED')
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="SYNC BREAKDOWNS" size="md">
      <div className="space-y-4">
        <p className="font-mono text-xs text-grey-light">
          COPY BREAKDOWN PERCENTAGES TO SELECTED MONTHS OF {year}.
          MONTHS WITHOUT A BUDGET WILL BE CREATED WITH THESE CATEGORIES.
        </p>

        <div className="flex items-center justify-between">
          <span className="font-mono text-xs text-grey-light">
            {selected.size} OF {MONTH_NAMES.length} MONTHS SELECTED
          </span>
          <div className="flex gap-2">
            <button onClick={selectAll} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
              SELECT ALL
            </button>
            <button onClick={deselectAll} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
              DESELECT
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {MONTH_NAMES.map((name, i) => {
            const m = i + 1
            const isSelected = selected.has(m)
            const hasBudget = existingMonths.has(m)
            return (
              <button
                key={name}
                onClick={() => toggle(m)}
                className={`font-mono text-xs uppercase py-3 border transition-colors ${
                  isSelected
                    ? 'border-white bg-white text-black font-bold'
                    : hasBudget
                    ? 'border-success text-success hover:border-white hover:text-white'
                    : 'border-grey-mid text-grey-light hover:border-white hover:text-white'
                }`}
              >
                {name}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 border border-success bg-transparent" />
            <span className="text-grey-light">HAS BUDGET</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 border border-grey-mid bg-transparent" />
            <span className="text-grey-light">NO BUDGET</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 border border-white bg-white" />
            <span className="text-grey-light">SELECTED</span>
          </span>
        </div>

        {breakdownCategories.length > 0 && (
          <div className="border border-grey-mid p-3 space-y-1">
            <p className="font-mono text-xs uppercase text-grey-light tracking-wider mb-2">CATEGORIES TO SYNC</p>
            {breakdownCategories.map((c) => (
              <div key={c.name} className="flex items-center gap-2 font-mono text-xs">
                <span className="text-white uppercase">{c.name}</span>
                <span className="text-grey-light">{c.percentage}%</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button onClick={handleSync} loading={loading} disabled={selected.size === 0}>
            SYNC {selected.size} MONTH{selected.size !== 1 ? 'S' : ''}
          </Button>
          <Button variant="ghost" onClick={onClose}>CANCEL</Button>
        </div>
      </div>
    </Modal>
  )
}
