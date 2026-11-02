'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import {
  CASH_DENOMINATIONS,
  SHARE_PRESETS,
  cashTotalOf,
  cleanShares,
  denominationLabel,
  distributeTips,
  summariseTips,
  totalTips,
  type CashCounts,
  type TipsShareInput,
} from '@/lib/tips'

interface TipsPeriod {
  id: string
  venueId: string
  label: string | null
  fromDate: string
  toDate: string
  cashCounts: CashCounts
  posTotal: number
  shares: TipsShareInput[]
  notes: string | null
}

function money(n: number): string {
  const value = Number.isFinite(n) ? n : 0
  return `$${value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dayKey(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

const todayKey = () => new Date().toISOString().slice(0, 10)

const SHARE_OPTIONS = SHARE_PRESETS.map((p) => ({ value: String(p.value), label: p.label }))

export function TipsClient({ venueId }: { venueId: string }) {
  const [periods, setPeriods] = useState<TipsPeriod[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [label, setLabel] = useState('')
  const [fromDate, setFromDate] = useState(todayKey())
  const [toDate, setToDate] = useState(todayKey())
  const [cashCounts, setCashCounts] = useState<CashCounts>({})
  const [posTotal, setPosTotal] = useState('')
  const [shares, setShares] = useState<TipsShareInput[]>([])
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const applyPeriod = useCallback((p: TipsPeriod | null) => {
    setSelectedId(p?.id ?? null)
    setLabel(p?.label ?? '')
    setFromDate(p ? dayKey(p.fromDate) : todayKey())
    setToDate(p ? dayKey(p.toDate) : todayKey())
    setCashCounts(p && p.cashCounts && typeof p.cashCounts === 'object' ? p.cashCounts : {})
    setPosTotal(p ? String(p.posTotal ?? '') : '')
    setShares(p && Array.isArray(p.shares) ? p.shares : [])
    setNotes(p?.notes ?? '')
    setError('')
  }, [])

  const loadList = useCallback(
    async (autoSelect = false) => {
      const r = await fetch(`/api/admin/tips?venueId=${encodeURIComponent(venueId)}`)
      const data = await r.json().catch(() => [])
      const list: TipsPeriod[] = Array.isArray(data) ? data : []
      setPeriods(list)
      if (autoSelect) applyPeriod(list[0] ?? null)
      return list
    },
    [venueId, applyPeriod],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    loadList(true).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [loadList])

  const cashTotal = cashTotalOf(cashCounts)
  const grandTotal = totalTips(cashTotal, Number(posTotal) || 0)
  const results = distributeTips(grandTotal, shares)
  const summary = summariseTips(grandTotal, shares)

  // Tier rollup — the Calculator sheet's per-share readout.
  const tiers = new Map<number, { count: number; value: number }>()
  for (const r of results) {
    const t = tiers.get(r.shareWeight) ?? { count: 0, value: 0 }
    t.count += 1
    t.value = r.value
    tiers.set(r.shareWeight, t)
  }
  const tierRows = [...tiers.entries()].sort((a, b) => b[0] - a[0])

  function setDenomination(denom: number, raw: string) {
    const qty = Math.max(0, Math.floor(Number(raw) || 0))
    setCashCounts((prev) => {
      const next = { ...prev }
      if (qty > 0) next[String(denom)] = qty
      else delete next[String(denom)]
      return next
    })
  }

  function addShare() {
    setShares((prev) => [...prev, { name: '', hours: 0, shareWeight: 1 }])
  }

  function updateShare(index: number, patch: Partial<TipsShareInput>) {
    setShares((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function removeShare(index: number) {
    setShares((prev) => prev.filter((_, i) => i !== index))
  }

  async function save() {
    setSaving(true)
    setError('')
    const payload = {
      venueId,
      label,
      fromDate,
      toDate,
      cashCounts,
      posTotal: Number(posTotal) || 0,
      shares: cleanShares(shares),
      notes,
    }
    const r = await fetch(selectedId ? `/api/admin/tips/${selectedId}` : '/api/admin/tips', {
      method: selectedId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      setError(body.error || 'SAVE FAILED')
      return
    }
    const saved: TipsPeriod = await r.json()
    setPeriods((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)])
    applyPeriod(saved)
  }

  async function remove() {
    if (!selectedId) return
    if (typeof window !== 'undefined' && !window.confirm('DELETE THIS TIPS PERIOD?')) return
    setSaving(true)
    const r = await fetch(`/api/admin/tips/${selectedId}`, { method: 'DELETE' })
    setSaving(false)
    if (!r.ok) {
      setError('DELETE FAILED')
      return
    }
    setPeriods((prev) => prev.filter((p) => p.id !== selectedId))
    applyPeriod(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">Tips</h1>
          <p className="font-mono text-xs uppercase tracking-wider text-grey-light">
            Cash + EFTPOS pooled · split by hours · kitchen share fixed
          </p>
        </div>
        <Button onClick={() => applyPeriod(null)}>+ NEW PERIOD</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-2">
          <p className="label">Periods</p>
          {loading ? (
            <p className="font-mono text-sm text-grey-light">LOADING…</p>
          ) : periods.length === 0 ? (
            <p className="font-mono text-sm text-grey-light">NO PERIODS YET</p>
          ) : (
            <div className="space-y-1">
              {periods.map((p) => {
                const active = p.id === selectedId
                const total = totalTips(cashTotalOf(p.cashCounts), p.posTotal)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPeriod(p)}
                    className={`w-full border px-3 py-2 text-left transition-colors ${
                      active ? 'border-white bg-grey-dark' : 'border-grey-mid hover:border-white'
                    }`}
                  >
                    <div className="font-mono text-sm uppercase text-white">
                      {p.label || `${dayKey(p.fromDate)} → ${dayKey(p.toDate)}`}
                    </div>
                    <div className="font-mono text-xs text-grey-light">
                      {dayKey(p.fromDate)} → {dayKey(p.toDate)} · {money(total)}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </aside>

        <section className="space-y-4">
          <Panel className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label="Label (optional)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="FEBRUARY 2026"
              />
              <Input
                label="From"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
              <Input label="To" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <p className="font-mono text-xs uppercase tracking-wider text-grey-light">
              Dates are for the books — they don&apos;t change the split.
            </p>
          </Panel>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel className="space-y-3">
              <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">Cash Calculator</h2>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between font-mono text-xs uppercase text-grey-light">
                  <span>Denomination</span>
                  <span>Value</span>
                </div>
                {CASH_DENOMINATIONS.map((denom) => {
                  const qty = cashCounts[String(denom)] ?? 0
                  return (
                    <div key={denom} className="flex items-center gap-2">
                      <span className="w-16 font-mono text-sm text-white">{denominationLabel(denom)}</span>
                      <Input
                        type="number"
                        min={0}
                        value={qty || ''}
                        onChange={(e) => setDenomination(denom, e.target.value)}
                        placeholder="0"
                        aria-label={`${denominationLabel(denom)} quantity`}
                      />
                      <span className="w-24 text-right font-mono text-sm text-grey-light">
                        {money(denom * qty)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center justify-between border-t border-grey-mid pt-3">
                <span className="font-mono text-xs uppercase text-grey-light">Cash total</span>
                <span className="font-mono text-lg font-bold text-white">{money(cashTotal)}</span>
              </div>
              <Input
                label="EFTPOS / POS holding (from finance)"
                type="number"
                min={0}
                step="0.01"
                value={posTotal}
                onChange={(e) => setPosTotal(e.target.value)}
                placeholder="0.00"
              />
              <div className="flex items-center justify-between border-t border-grey-mid pt-3">
                <span className="font-mono text-xs uppercase text-grey-light">Total accrued tips</span>
                <span className="font-mono text-2xl font-bold text-success">{money(grandTotal)}</span>
              </div>
            </Panel>

            <Panel className="space-y-3">
              <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">Calculator Summary</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="font-mono text-xs uppercase text-grey-light">Tips amount</div>
                  <div className="font-mono text-sm text-white">{money(summary.totalTips)}</div>
                </div>
                <div>
                  <div className="font-mono text-xs uppercase text-grey-light">Share units</div>
                  <div className="font-mono text-sm text-white">{summary.weightTotal.toFixed(2)}</div>
                </div>
                <div>
                  <div className="font-mono text-xs uppercase text-grey-light">Full share value</div>
                  <div className="font-mono text-sm text-white">{money(summary.perUnit)}</div>
                </div>
                <div>
                  <div className="font-mono text-xs uppercase text-grey-light">Difference</div>
                  <div className={`font-mono text-sm ${summary.difference === 0 ? 'text-success' : 'text-danger'}`}>
                    {money(summary.difference)}
                  </div>
                </div>
              </div>
              <div className="border-t border-grey-mid pt-3">
                <div className="mb-1 font-mono text-xs uppercase text-grey-light">Per-share readout</div>
                <div className="space-y-1">
                  {tierRows.length === 0 ? (
                    <p className="font-mono text-xs text-grey-light">NO SHARES YET</p>
                  ) : (
                    tierRows.map(([weight, t]) => (
                      <div key={weight} className="flex items-center justify-between font-mono text-xs text-white">
                        <span>
                          {t.count} × {weight} SHARE
                        </span>
                        <span>{money(t.value)} EACH</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Panel>
          </div>

          <Panel className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">Tips Breakdown</h2>
              <Button size="sm" variant="ghost" onClick={addShare}>
                + ADD STAFF
              </Button>
            </div>
            {shares.length === 0 ? (
              <p className="font-mono text-sm text-grey-light">
                NO STAFF YET — ADD PEOPLE AND THEIR HOURS FOR THIS PERIOD.
              </p>
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[1fr_6rem_9rem_7rem_2rem] items-center gap-2 font-mono text-xs uppercase text-grey-light">
                  <span>Name</span>
                  <span>Hours</span>
                  <span>Share</span>
                  <span className="text-right">Value</span>
                  <span />
                </div>
                {shares.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_6rem_9rem_7rem_2rem] items-center gap-2">
                    <Input
                      value={s.name}
                      onChange={(e) => updateShare(i, { name: e.target.value })}
                      placeholder="NAME"
                      aria-label={`Staff ${i + 1} name`}
                    />
                    <Input
                      type="number"
                      min={0}
                      value={s.hours || ''}
                      onChange={(e) => updateShare(i, { hours: Number(e.target.value) || 0 })}
                      placeholder="0"
                      aria-label={`Staff ${i + 1} hours`}
                    />
                    <Select
                      value={String(s.shareWeight)}
                      onChange={(e) => updateShare(i, { shareWeight: Number(e.target.value) })}
                      options={SHARE_OPTIONS}
                      aria-label={`Staff ${i + 1} share`}
                    />
                    <span className="text-right font-mono text-sm text-white">{money(results[i]?.value ?? 0)}</span>
                    <button
                      type="button"
                      onClick={() => removeShare(i)}
                      className="font-mono text-sm text-grey-light transition-colors hover:text-danger"
                      aria-label={`Remove staff ${i + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="space-y-3">
            <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            {error && <p className="font-mono text-sm text-danger">{error}</p>}
            <div className="flex flex-wrap items-center gap-2 border-t border-grey-mid pt-3">
              <Button onClick={save} loading={saving}>
                SAVE PERIOD
              </Button>
              {selectedId && (
                <Button variant="danger" onClick={remove} disabled={saving}>
                  DELETE
                </Button>
              )}
            </div>
          </Panel>
        </section>
      </div>
    </div>
  )
}
