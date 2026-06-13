'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface Allocation {
  id: string
  date: string
  amount: number
  isWorkingDay: boolean
  note: string | null
}
interface Period {
  id: string
  year: number
  month: number
  totalBudget: number
  label: string | null
  allocations: Allocation[]
}
interface Venue { id: string; name: string }

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function money(n: number) {
  return n.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD', maximumFractionDigits: 0 })
}

export function BudgetClient({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [venueId, setVenueId] = useState(role === 'MANAGER' ? sessionVenueId : '')
  const [venues, setVenues] = useState<Venue[]>([])
  const [period, setPeriod] = useState<Period | null>(null)
  const [loading, setLoading] = useState(true)

  // Local editable state
  const [total, setTotal] = useState('')
  const [label, setLabel] = useState('')
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')

  async function loadVenues() {
    if (role !== 'ADMIN') return
    const r = await fetch('/api/admin/venues')
    setVenues(await r.json())
  }

  async function load() {
    setLoading(true); setMessage('')
    const params = new URLSearchParams({ year: String(year), month: String(month) })
    if (venueId) params.set('venueId', venueId)
    const r = await fetch(`/api/admin/budget?${params}`)
    const data = await r.json()
    setPeriod(data.period)
    if (data.period) {
      setTotal(String(data.period.totalBudget))
      setLabel(data.period.label ?? '')
      setAllocations(data.period.allocations)
    } else {
      setTotal(''); setLabel(''); setAllocations([])
    }
    setLoading(false)
  }

  useEffect(() => { loadVenues() }, [])
  useEffect(() => { load() }, [year, month, venueId])

  async function createPeriod() {
    setCreating(true); setMessage('')
    const r = await fetch('/api/admin/budget', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId: venueId || undefined, year, month, totalBudget: Number(total) || 0, label }),
    })
    setCreating(false)
    if (r.ok) { const d = await r.json(); applyPeriod(d.period) }
  }

  function applyPeriod(p: Period) {
    setPeriod(p); setTotal(String(p.totalBudget)); setLabel(p.label ?? ''); setAllocations(p.allocations)
  }

  function setAlloc(id: string, patch: Partial<Allocation>) {
    setAllocations((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }

  function evenSplit() {
    const budget = Number(total) || 0
    const working = allocations.filter((a) => a.isWorkingDay)
    if (working.length === 0) return
    const per = Math.floor((budget / working.length) * 100) / 100
    let allocated = 0
    const workingIds = working.map((w) => w.id)
    const next = allocations.map((a) => (a.isWorkingDay ? { ...a, amount: per } : { ...a, amount: 0 }))
    // put rounding remainder on the last working day
    allocated = per * working.length
    const remainder = Math.round((budget - allocated) * 100) / 100
    if (remainder !== 0 && workingIds.length) {
      const lastId = workingIds[workingIds.length - 1]
      const idx = next.findIndex((a) => a.id === lastId)
      if (idx >= 0) next[idx] = { ...next[idx], amount: Math.round((next[idx].amount + remainder) * 100) / 100 }
    }
    setAllocations(next)
  }

  async function save() {
    if (!period) return
    setSaving(true); setMessage('')
    const r = await fetch(`/api/admin/budget/${period.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalBudget: Number(total) || 0,
        label,
        allocations: allocations.map((a) => ({ id: a.id, amount: Number(a.amount) || 0, isWorkingDay: a.isWorkingDay, note: a.note })),
      }),
    })
    setSaving(false)
    if (r.ok) { const d = await r.json(); applyPeriod(d.period); setMessage('SAVED') }
    else setMessage('SAVE FAILED')
  }

  function prevMonth() { if (month === 1) { setYear(year - 1); setMonth(12) } else setMonth(month - 1) }
  function nextMonth() { if (month === 12) { setYear(year + 1); setMonth(1) } else setMonth(month + 1) }

  const budgetNum = Number(total) || 0
  const allocatedTotal = allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
  const diff = Math.round((budgetNum - allocatedTotal) * 100) / 100
  const workingCount = allocations.filter((a) => a.isWorkingDay).length
  const venueOptions = [{ value: '', label: 'SELECT VENUE' }, ...venues.map((v) => ({ value: v.id, label: v.name }))]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">BUDGET</h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">SPLIT A MONTHLY BUDGET ACROSS WORKING DAYS</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {role === 'ADMIN' && (
            <div className="w-44"><Select value={venueId} onChange={(e) => setVenueId(e.target.value)} options={venueOptions} /></div>
          )}
          <button onClick={prevMonth} className="font-mono text-xs uppercase border border-grey-mid px-3 py-2 text-white hover:border-white transition-colors">← PREV</button>
          <span className="font-mono text-sm uppercase text-white w-28 text-center">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="font-mono text-xs uppercase border border-grey-mid px-3 py-2 text-white hover:border-white transition-colors">NEXT →</button>
        </div>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : role === 'ADMIN' && !venueId ? (
        <p className="font-mono text-xs text-grey-light">SELECT A VENUE TO MANAGE ITS BUDGET.</p>
      ) : !period ? (
        <div className="bg-grey-dark border border-grey-mid p-4 max-w-md space-y-3">
          <p className="font-mono text-xs text-grey-light">NO BUDGET SET FOR {MONTHS[month - 1]} {year}.</p>
          <Input label="Total Budget ($)" type="number" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="50000" />
          <Input label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="WAGES" />
          <Button onClick={createPeriod} loading={creating}>CREATE BUDGET</Button>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-grey-dark border border-grey-mid p-3">
              <div className="font-mono text-xs uppercase text-grey-light mb-1">TOTAL BUDGET</div>
              <input type="number" value={total} onChange={(e) => setTotal(e.target.value)} className="bg-black border border-grey-mid text-white font-mono text-lg px-2 py-1 w-full outline-none focus:border-white" />
            </div>
            <div className="bg-grey-dark border border-grey-mid p-3">
              <div className="font-mono text-xs uppercase text-grey-light mb-1">ALLOCATED</div>
              <div className="font-mono text-lg text-white">{money(allocatedTotal)}</div>
            </div>
            <div className="bg-grey-dark border border-grey-mid p-3">
              <div className="font-mono text-xs uppercase text-grey-light mb-1">{diff < 0 ? 'OVER BY' : 'REMAINING'}</div>
              <div className="font-mono text-lg" style={{ color: diff === 0 ? '#4ADE80' : diff < 0 ? '#F87171' : '#FACC15' }}>{money(Math.abs(diff))}</div>
            </div>
            <div className="bg-grey-dark border border-grey-mid p-3">
              <div className="font-mono text-xs uppercase text-grey-light mb-1">WORKING DAYS</div>
              <div className="font-mono text-lg text-white">{workingCount}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="ghost" onClick={evenSplit}>EVEN SPLIT</Button>
            <Button size="sm" onClick={save} loading={saving}>SAVE</Button>
            {message && <span className={`font-mono text-xs ${message === 'SAVED' ? 'text-success' : 'text-danger'}`}>{message}</span>}
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="LABEL (e.g. WAGES)" className="max-w-40" />
          </div>

          {/* Day table */}
          <div className="overflow-x-auto">
            <table className="w-full border border-grey-mid">
              <thead>
                <tr className="border-b border-grey-mid">
                  {['DATE', 'DAY', 'WORKING', 'AMOUNT', 'NOTE'].map((h) => (
                    <th key={h} className="px-3 py-2 font-mono text-xs uppercase text-grey-light text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-grey-mid">
                {allocations.map((a) => {
                  const d = new Date(a.date)
                  const dow = d.getUTCDay()
                  const weekend = dow === 0 || dow === 6
                  return (
                    <tr key={a.id} className={`${a.isWorkingDay ? '' : 'opacity-40'} ${weekend ? 'bg-black/20' : ''}`}>
                      <td className="px-3 py-1.5 font-mono text-xs text-white">{d.getUTCDate()}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-grey-light">{DOW[dow]}</td>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={a.isWorkingDay} onChange={(e) => setAlloc(a.id, { isWorkingDay: e.target.checked, amount: e.target.checked ? a.amount : 0 })} className="w-4 h-4 accent-white" />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" value={a.amount} disabled={!a.isWorkingDay} onChange={(e) => setAlloc(a.id, { amount: Number(e.target.value) })} className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 w-28 outline-none focus:border-white disabled:opacity-40" />
                      </td>
                      <td className="px-3 py-1.5">
                        <input value={a.note ?? ''} onChange={(e) => setAlloc(a.id, { note: e.target.value })} placeholder="—" className="bg-black border border-grey-mid text-grey-light font-sans text-xs px-2 py-1 w-full outline-none focus:border-white" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
