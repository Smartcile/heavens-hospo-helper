'use client'

import { useEffect, useState, useCallback } from 'react'
import { BudgetMonthSelector } from '@/components/admin/BudgetMonthSelector'
import { BudgetSetupPanel } from '@/components/admin/BudgetSetupPanel'
import { BudgetDailyGrid } from '@/components/admin/BudgetDailyGrid'
import { generateDailyBudgetsNormalized, computeBreakdowns } from '@/lib/budget-math'
import type {
  DayWeight,
  BudgetMathResult,
  BudgetMathResultWithBreakdowns,
  BreakdownInput,
} from '@/lib/budget-math'

interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string }

interface ApiDay {
  id: string; date: string; isWorkingDay: boolean
}

interface ApiCategory {
  id: string; name: string; departmentId: string | null; percentage: number
}

interface ApiAllocation {
  budgetDayId: string; budgetCategoryId: string; amount: number; note: string | null
}

interface ApiPeriod {
  id: string; year: number; month: number; totalBudget: number
  dailyWeights: Record<string, number> | null
  categories: ApiCategory[]; days: ApiDay[]; allocations: ApiAllocation[]
}

interface AllocationEntry {
  categoryId: string; budgetDayId: string; amount: number; note: string
}

interface CategoryRow {
  id: string; name: string; departmentId: string; percentage: number
}

const DEFAULT_WEIGHTS: DayWeight = { mon: 5, tue: 5, wed: 10, thu: 15, fri: 25, sat: 25, sun: 15 }

export function BudgetPageClient({
  role,
  sessionVenueId,
  year,
  month,
}: {
  role: string; sessionVenueId: string; year: number; month: number
}) {
  const [period, setPeriod] = useState<ApiPeriod | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedVenueId, setSelectedVenueId] = useState(role === 'MANAGER' ? sessionVenueId : '')
  const [revenueCategoryId, setRevenueCategoryId] = useState(crypto.randomUUID())

  const [totalBudget, setTotalBudget] = useState(0)
  const [dailyWeights, setDailyWeights] = useState<DayWeight>(DEFAULT_WEIGHTS)
  const [breakdownCategories, setBreakdownCategories] = useState<CategoryRow[]>([])
  const [allocations, setAllocations] = useState<AllocationEntry[]>([])
  const [generatedResult, setGeneratedResult] = useState<BudgetMathResultWithBreakdowns | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setMessage('')
    const params = new URLSearchParams({ year: String(year), month: String(month) })
    const vid = role === 'MANAGER' ? sessionVenueId : selectedVenueId
    if (vid) params.set('venueId', vid)

    if (!vid) {
      setPeriod(null); setTotalBudget(0); setBreakdownCategories([])
      setDailyWeights(DEFAULT_WEIGHTS); setAllocations([])
      setGeneratedResult(null); setRevenueCategoryId(crypto.randomUUID())
      setLoading(false); return
    }

    const r = await fetch(`/api/admin/budget?${params}`)
    const data = await r.json()
    setPeriod(data.period)

    if (data.period) {
      const p = data.period as ApiPeriod
      setTotalBudget(p.totalBudget)
      const savedCategories = p.categories.map((c: ApiCategory) => ({
        id: c.id, name: c.name, departmentId: c.departmentId || '', percentage: c.percentage,
      }))
      const revenueCat = savedCategories.find((c) => c.name === 'REVENUE')
      if (revenueCat) setRevenueCategoryId(revenueCat.id)
      setBreakdownCategories(savedCategories.filter((c) => c.name !== 'REVENUE'))
      setDailyWeights(
        p.dailyWeights && Object.values(p.dailyWeights).some((v: number) => v > 0)
          ? (p.dailyWeights as unknown as DayWeight) : DEFAULT_WEIGHTS
      )
      setAllocations(p.allocations.map((a: ApiAllocation) => ({
        categoryId: a.budgetCategoryId, budgetDayId: a.budgetDayId, amount: a.amount, note: a.note || '',
      })))

      if (p.allocations.length > 0 && p.days.length > 0) {
        const weight = p.dailyWeights && Object.values(p.dailyWeights).some((v: number) => v > 0)
          ? (p.dailyWeights as unknown as DayWeight) : DEFAULT_WEIGHTS
        const existingMap = new Map(p.allocations
          .filter((a) => a.budgetCategoryId === revenueCategoryId)
          .map((a) => [a.budgetDayId, a.amount]))
        const revenueResult = generateDailyBudgetsNormalized(
          p.totalBudget, [{ id: revenueCategoryId, name: 'REVENUE', percentage: 100 }], weight,
          p.days.map((d: ApiDay) => ({ id: d.id, date: new Date(d.date), dayOfWeek: new Date(d.date).getUTCDay(), isWorkingDay: d.isWorkingDay })),
          existingMap
        )
        const breakdownInputs: BreakdownInput[] = savedCategories.filter((c) => c.name !== 'REVENUE').map((c) => ({
          id: c.id, name: c.name, departmentId: c.departmentId || null, percentage: c.percentage,
        }))
        setGeneratedResult(computeBreakdowns(revenueResult, breakdownInputs))
      }
    } else {
      setTotalBudget(0)
      if (data.defaults?.categories) {
        setBreakdownCategories(data.defaults.categories.map((c: ApiCategory) => ({
          id: crypto.randomUUID(), name: c.name, departmentId: c.departmentId || '', percentage: c.percentage,
        })))
      } else { setBreakdownCategories([]) }
      setDailyWeights(DEFAULT_WEIGHTS); setAllocations([]); setGeneratedResult(null)
    }
    setLoading(false)
  }, [year, month, role, sessionVenueId, selectedVenueId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (role === 'ADMIN') {
      fetch('/api/admin/venues').then((r) => r.json()).then((v: Venue[]) => {
        setVenues(v)
        if (!selectedVenueId && v.length > 0) setSelectedVenueId(v[0].id)
      })
    }
  }, [role])

  function handleVenueChange(vid: string) {
    setSelectedVenueId(vid); setPeriod(null); setTotalBudget(0); setBreakdownCategories([])
    setDailyWeights(DEFAULT_WEIGHTS); setAllocations([]); setGeneratedResult(null)
    setRevenueCategoryId(crypto.randomUUID()); setDepartments([])
  }

  function handleDepartmentsLoad(deps: Department[]) { setDepartments(deps) }
  async function handlePeriodCreated(id: string) { await load() }

  function buildCatPayload() {
    return [
      { id: revenueCategoryId, name: 'REVENUE', departmentId: null, percentage: 100 },
      ...breakdownCategories.map((c) => ({
        id: c.id, name: c.name, departmentId: c.departmentId || null, percentage: c.percentage,
      })),
    ]
  }

  async function handleGenerate() {
    if (!period) return
    setGenerating(true); setMessage('')

    const saveR = await fetch(`/api/admin/budget/${period.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalBudget, dailyWeights, categories: buildCatPayload() }),
    })
    if (!saveR.ok) { setGenerating(false); setMessage('SAVE FAILED'); return }

    const saveD = await saveR.json()
    const savedPeriod = saveD.period as ApiPeriod
    setPeriod(savedPeriod)
    const savedCategories = savedPeriod.categories.map((c: ApiCategory) => ({
      id: c.id, name: c.name, departmentId: c.departmentId || '', percentage: c.percentage,
    }))
    const rev = savedCategories.find((c) => c.name === 'REVENUE')
    if (rev) setRevenueCategoryId(rev.id)
    setBreakdownCategories(savedCategories.filter((c) => c.name !== 'REVENUE'))

    const revenueResult = generateDailyBudgetsNormalized(
      totalBudget, [{ id: revenueCategoryId, name: 'REVENUE', percentage: 100 }], dailyWeights,
      savedPeriod.days.map((d: ApiDay) => ({ id: d.id, date: new Date(d.date), dayOfWeek: new Date(d.date).getUTCDay(), isWorkingDay: d.isWorkingDay }))
    )
    const breakdownInputs: BreakdownInput[] = savedCategories.filter((c) => c.name !== 'REVENUE').map((c) => ({
      id: c.id, name: c.name, departmentId: c.departmentId || null, percentage: c.percentage,
    }))
    const resultWithBreakdowns = computeBreakdowns(revenueResult, breakdownInputs)

    const newAllocations: AllocationEntry[] = []
    for (const day of resultWithBreakdowns.allocations) {
      if (!day.isWorkingDay) continue
      newAllocations.push({
        budgetDayId: day.dayId, categoryId: revenueCategoryId,
        amount: day.revenue, note: '',
      })
    }
    setAllocations(newAllocations)
    setGeneratedResult(resultWithBreakdowns)
    setGenerating(false); setMessage('GENERATED')
  }

  async function handleSave() {
    if (!period) return
    setSaving(true); setMessage('')
    const dayPayload = period.days.map((d) => ({ id: d.id, isWorkingDay: d.isWorkingDay }))
    const allocPayload = allocations.map((a) => ({
      budgetDayId: a.budgetDayId, budgetCategoryId: a.categoryId, amount: a.amount, note: a.note || null,
    }))
    const r = await fetch(`/api/admin/budget/${period.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalBudget, dailyWeights, categories: buildCatPayload(), days: dayPayload, allocations: allocPayload }),
    })
    setSaving(false)
    if (r.ok) { await load(); setMessage('SAVED') } else { setMessage('SAVE FAILED') }
  }

  async function handleSyncBreakdowns() {
    const vid = role === 'MANAGER' ? sessionVenueId : selectedVenueId
    if (!vid || breakdownCategories.length === 0) return
    if (!confirm(`Copy breakdowns to ALL months in this venue?`)) return
    setSyncing(true); setMessage('')
    const r = await fetch('/api/admin/budget/sync-breakdowns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId: vid,
        sourceCategories: breakdownCategories.map((c) => ({
          name: c.name, departmentId: c.departmentId || null, percentage: c.percentage,
        })),
      }),
    })
    setSyncing(false)
    if (r.ok) { const d = await r.json(); setMessage(`SYNCED ${d.syncedPeriods} MONTHS`) }
    else { setMessage('SYNC FAILED') }
  }

  async function handleDelete() {
    if (!period) return
    if (!confirm(`Delete budget for ${MONTH_NAMES[month - 1]} ${year}?`)) return
    const r = await fetch(`/api/admin/budget/${period.id}`, { method: 'DELETE' })
    if (r.ok) {
      setPeriod(null); setTotalBudget(0); setBreakdownCategories([])
      setDailyWeights(DEFAULT_WEIGHTS); setAllocations([]); setGeneratedResult(null)
      setRevenueCategoryId(crypto.randomUUID()); setMessage('DELETED')
    } else { setMessage('DELETE FAILED') }
  }

  function handleAllocationChange(dayId: string, categoryId: string, amount: number, note: string) {
    setAllocations((prev) => {
      const idx = prev.findIndex((a) => a.budgetDayId === dayId && a.categoryId === categoryId)
      if (idx >= 0) { const next = [...prev]; next[idx] = { budgetDayId: dayId, categoryId, amount, note }; return next }
      return [...prev, { budgetDayId: dayId, categoryId, amount, note }]
    })
  }

  const revenueAllocations = allocations.filter((a) => a.categoryId === revenueCategoryId)
  const allocatedTotal = revenueAllocations.reduce((sum, a) => sum + Number(a.amount || 0), 0)
  const budgetStats: { targetTotal: number; allocatedTotal: number; variance: number } | null = generatedResult
    ? { targetTotal: totalBudget, allocatedTotal, variance: Math.round((allocatedTotal - totalBudget) * 100) / 100 }
    : null

  return (
    <div className="p-6 space-y-6">
      <BudgetMonthSelector year={year} month={month} variant="compact" role={role} venues={venues} selectedVenueId={selectedVenueId} onVenueChange={handleVenueChange} />
      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <>
          <BudgetSetupPanel role={role} selectedVenueId={selectedVenueId} periodId={period?.id || null} totalBudget={totalBudget} dailyWeights={dailyWeights} savedBreakdowns={breakdownCategories} onDepartmentsLoad={handleDepartmentsLoad} onPeriodCreated={handlePeriodCreated} onUpdateTotal={setTotalBudget} onUpdateWeights={setDailyWeights} onUpdateCategories={setBreakdownCategories}             onGenerate={handleGenerate}
            onSyncBreakdowns={handleSyncBreakdowns}
            onSave={handleSave} onDelete={handleDelete}
            budgetStats={budgetStats}
            generating={generating}
            saving={saving}
            syncing={syncing} message={message} year={year} month={month} />
          {generatedResult && (
            <BudgetDailyGrid result={generatedResult} allocations={allocations} revenueCategoryId={revenueCategoryId} breakdownCategories={breakdownCategories} onAllocationChange={handleAllocationChange} />
          )}
        </>
      )}
    </div>
  )
}

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
