'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { DayWeight } from '@/lib/budget-math'

interface Department { id: string; name: string; venueId: string }

interface CategoryRow {
  id: string
  name: string
  departmentId: string
  percentage: number
}

interface BudgetStats {
  targetTotal: number
  allocatedTotal: number
  variance: number
}

interface Props {
  role: string
  selectedVenueId: string
  periodId: string | null
  totalBudget: number
  dailyWeights: DayWeight
  savedBreakdowns: CategoryRow[]
  budgetStats: BudgetStats | null
  onDepartmentsLoad: (deps: Department[]) => void
  onPeriodCreated: (id: string) => void
  onUpdateTotal: (value: number) => void
  onUpdateWeights: (weights: DayWeight) => void
  onUpdateCategories: (cats: CategoryRow[]) => void
  onGenerate: () => void
  onSyncBreakdowns: () => void
  onSave: () => void
  onDelete: () => void
  generating: boolean
  saving: boolean
  syncing: boolean
  message: string
  year: number
  month: number
}

function money(n: number) {
  return n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
}

const DAY_LABELS: { key: keyof DayWeight; label: string }[] = [
  { key: 'mon', label: 'MON' }, { key: 'tue', label: 'TUE' },
  { key: 'wed', label: 'WED' }, { key: 'thu', label: 'THU' },
  { key: 'fri', label: 'FRI' }, { key: 'sat', label: 'SAT' },
  { key: 'sun', label: 'SUN' },
]

const DEFAULT_WEIGHTS: DayWeight = { mon: 5, tue: 5, wed: 10, thu: 15, fri: 25, sat: 25, sun: 15 }

export function BudgetSetupPanel({
  role,
  selectedVenueId,
  periodId,
  totalBudget,
  dailyWeights,
  savedBreakdowns,
  budgetStats,
  onDepartmentsLoad,
  onPeriodCreated,
  onUpdateTotal,
  onUpdateWeights,
  onUpdateCategories,
  onGenerate,
  onSyncBreakdowns,
  onSave,
  onDelete,
  generating,
  saving,
  syncing,
  message,
  year,
  month,
}: Props) {
  const [departments, setDepartments] = useState<Department[]>([])
  const [creating, setCreating] = useState(false)

  const [localTotal, setLocalTotal] = useState(String(totalBudget || ''))
  const [localWeights, setLocalWeights] = useState<DayWeight>(dailyWeights || DEFAULT_WEIGHTS)
  const [localBreakdowns, setLocalBreakdowns] = useState<CategoryRow[]>(savedBreakdowns)

  useEffect(() => { setLocalTotal(String(totalBudget || '')) }, [totalBudget])
  useEffect(() => {
    if (dailyWeights && Object.values(dailyWeights).some((v) => v > 0)) setLocalWeights(dailyWeights)
  }, [dailyWeights])
  useEffect(() => { setLocalBreakdowns(savedBreakdowns) }, [savedBreakdowns])

  useEffect(() => {
    if (selectedVenueId) {
      fetch(`/api/admin/departments?venueId=${selectedVenueId}`)
        .then((r) => r.json())
        .then((deps) => { setDepartments(deps); onDepartmentsLoad(deps) })
    } else {
      setDepartments([])
      onDepartmentsLoad([])
    }
  }, [selectedVenueId])

  const deptOptions = [{ value: '', label: '—' }, { value: '__venue__', label: 'VENUE' }, ...departments.map((d) => ({ value: d.id, label: d.name }))]
  const weightSum = Object.values(localWeights).reduce((s, v) => s + v, 0)
  const weightOk = weightSum === 100
  const breakdownPctSum = localBreakdowns.reduce((s, c) => s + (Number(c.percentage) || 0), 0)
  const remainderPct = Math.max(0, 100 - breakdownPctSum)

  function addBreakdown() {
    setLocalBreakdowns((prev) => [...prev, { id: crypto.randomUUID(), name: '', departmentId: '', percentage: 0 }])
  }
  function removeBreakdown(index: number) {
    setLocalBreakdowns((prev) => prev.filter((_, i) => i !== index))
  }
  function updateBreakdown(index: number, patch: Partial<CategoryRow>) {
    setLocalBreakdowns((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }
  function handleTotalChange(value: string) {
    setLocalTotal(value)
    onUpdateTotal(Number(value) || 0)
  }
  function handleWeightChange(key: keyof DayWeight, value: string) {
    const next = { ...localWeights, [key]: Number(value) || 0 }
    setLocalWeights(next)
    onUpdateWeights(next)
  }
  function commitBreakdowns() { onUpdateCategories(localBreakdowns) }

  async function createPeriod() {
    setCreating(true)
    const r = await fetch('/api/admin/budget', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId: selectedVenueId || undefined, year, month, totalBudget: Number(localTotal) || 0 }),
    })
    setCreating(false)
    if (r.ok) { const d = await r.json(); if (d.period) onPeriodCreated(d.period.id) }
  }

  function handleGenerateClick() { commitBreakdowns(); onGenerate() }
  const canGenerate = weightOk && periodId

  return (
    <div className="space-y-4">
      {role === 'ADMIN' && !selectedVenueId ? (
        <p className="font-mono text-xs text-grey-light">SELECT A VENUE ABOVE TO MANAGE ITS BUDGET.</p>
      ) : !periodId ? (
        <div className="bg-grey-dark border border-grey-mid p-4 max-w-md space-y-3">
          <p className="font-mono text-xs text-grey-light">NO BUDGET SET FOR THIS MONTH.</p>
          <Input label="TOTAL BUDGET ($)" type="number" value={localTotal} onChange={(e) => handleTotalChange(e.target.value)} placeholder="350000" />
          <Button onClick={createPeriod} loading={creating}>CREATE BUDGET</Button>
        </div>
      ) : (
        <div className="border border-grey-mid p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* LEFT: ALLOCATION */}
            <div className="space-y-4">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">ALLOCATION</h3>
              <Input label="TOTAL BUDGET ($)" type="number" value={localTotal} onChange={(e) => handleTotalChange(e.target.value)} placeholder="350000" className="max-w-xs" />

              <div className="border border-grey-mid p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold uppercase text-white w-36">REVENUE</span>
                  <span className="font-mono text-xs text-grey-light w-32">—</span>
                  <span className="font-mono text-xs text-success w-20">100%</span>
                  <span className="font-mono text-xs text-grey-light w-20 text-right">
                    {totalBudget ? `$${totalBudget.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}` : ''}
                  </span>
                </div>

                <div className="border-l border-grey-mid ml-2 pl-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={onSyncBreakdowns} loading={syncing}>↻ SYNC BREAKDOWNS</Button>
                  </div>
                  {localBreakdowns.map((cat, i) => (
                    <div key={cat.id} className="flex items-center gap-2 flex-wrap">
                      <input value={cat.name} onChange={(e) => updateBreakdown(i, { name: e.target.value })} onBlur={commitBreakdowns} placeholder="NAME" className="bg-black border border-grey-mid text-white font-mono text-xs uppercase px-2 py-1.5 w-36 outline-none focus:border-white placeholder:text-grey-light" />
                      <Select value={cat.departmentId} onChange={(e) => updateBreakdown(i, { departmentId: e.target.value })} onBlur={commitBreakdowns} options={deptOptions} placeholder="DEPT" className="!px-2 !py-1.5 w-32 font-mono text-xs uppercase" />
                      <input type="number" value={cat.percentage || ''} onChange={(e) => updateBreakdown(i, { percentage: Number(e.target.value) })} onBlur={commitBreakdowns} placeholder="%" className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 w-20 outline-none focus:border-white placeholder:text-grey-light" />
                      <span className="font-mono text-xs text-grey-light w-20 text-right">
                        {totalBudget && cat.percentage ? `$${Math.round(totalBudget * (cat.percentage / 100)).toLocaleString('en-NZ', { maximumFractionDigits: 0 })}` : ''}
                      </span>
                      <button onClick={() => removeBreakdown(i)} className="font-mono text-xs text-danger hover:text-white px-2">✕</button>
                    </div>
                  ))}

                  <Button size="sm" variant="ghost" onClick={addBreakdown}>+ ADD BREAKDOWN</Button>

                  {remainderPct > 0 && (
                    <div className="flex items-center gap-2 opacity-50">
                      <span className="font-mono text-xs uppercase text-grey-light w-36">REMAINDER</span>
                      <span className="font-mono text-xs text-grey-light w-32">—</span>
                      <span className="font-mono text-xs text-grey-light w-20">{remainderPct}%</span>
                      <span className="font-mono text-xs text-grey-light w-20 text-right">
                        {totalBudget ? `$${Math.round(totalBudget * (remainderPct / 100)).toLocaleString('en-NZ', { maximumFractionDigits: 0 })}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-grey-dark border border-grey-mid">
                  <div className="h-full bg-success transition-all" style={{ width: `${Math.min(breakdownPctSum, 100)}%` }} />
                </div>
                <span className={`font-mono text-xs ${breakdownPctSum <= 100 ? 'text-grey-light' : 'text-danger'}`}>{breakdownPctSum}%</span>
              </div>
              {breakdownPctSum > 100 && <p className="font-mono text-xs text-danger">EXCEEDS 100% BY {breakdownPctSum - 100}%</p>}
            </div>

            {/* RIGHT: DAILY WEIGHTING + SUMMARY */}
            <div className="space-y-4">
              <div className="space-y-3">
                <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">DAILY WEIGHTING</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {DAY_LABELS.map((d) => (
                    <div key={d.key} className="flex flex-col items-center gap-1">
                      <span className="font-mono text-xs text-grey-light">{d.label}</span>
                      <input type="number" value={localWeights[d.key] || ''} onChange={(e) => handleWeightChange(d.key, e.target.value)} min={0} max={100} className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 w-14 text-center outline-none focus:border-white" />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-grey-dark border border-grey-mid">
                    <div className={`h-full transition-all ${weightOk ? 'bg-success' : 'bg-danger'}`} style={{ width: `${Math.min(weightSum, 100)}%` }} />
                  </div>
                  <span className={`font-mono text-xs ${weightOk ? 'text-success' : 'text-danger'}`}>{weightSum}%</span>
                </div>
                {!weightOk && <p className="font-mono text-xs text-danger">WEIGHTS MUST SUM TO 100%</p>}
              </div>

              {budgetStats && (
                <div className="border border-grey-mid p-3 space-y-3">
                  <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">SUMMARY</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="font-mono text-xs uppercase text-grey-light mb-0.5">TARGET</div>
                      <div className="font-mono text-sm text-white">{money(budgetStats.targetTotal)}</div>
                    </div>
                    <div>
                      <div className="font-mono text-xs uppercase text-grey-light mb-0.5">ALLOCATED</div>
                      <div className="font-mono text-sm text-white">{money(budgetStats.allocatedTotal)}</div>
                    </div>
                    <div>
                      <div className="font-mono text-xs uppercase text-grey-light mb-0.5">VARIANCE</div>
                      <div className={`font-mono text-sm ${budgetStats.variance === 0 ? 'text-success' : 'text-[#FACC15]'}`}>
                        {budgetStats.variance >= 0 ? '+' : ''}{money(budgetStats.variance)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button onClick={handleGenerateClick} disabled={!canGenerate} loading={generating}>GENERATE GRID</Button>
                    <Button size="sm" variant="ghost" onClick={onSave} loading={saving}>SAVE</Button>
                    <Button size="sm" variant="danger" onClick={onDelete}>DELETE</Button>
                    {message && (
                      <span className={`font-mono text-xs ${message === 'SAVED' || message === 'GENERATED' || message.startsWith('SYNCED') ? 'text-success' : 'text-danger'}`}>{message}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
