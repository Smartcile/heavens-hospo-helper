'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import {
  CASH_DENOMINATIONS,
  cashTotalOf,
  denominationLabel,
  isTipsPeriodLocked,
  tipsProgress,
  totalTips,
  valueTipsShares,
  type CashCounts,
  type TipsShareRow,
  type TipsShareStatusValue,
} from '@/lib/tips'

interface TipsPeriod {
  id: string
  venueId: string
  label: string | null
  fromDate: string
  toDate: string
  cashCounts: CashCounts
  posTotal: number
  notes: string | null
  poolTotal: number
  shares: TipsShareRow[]
}

interface StaffOption {
  id: string
  name: string
  departmentName: string | null
}

function money(n: number): string {
  const value = Number.isFinite(n) ? n : 0
  return `$${value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dayKey(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

const todayKey = () => new Date().toISOString().slice(0, 10)

const STATUS_TONE: Record<TipsShareStatusValue, string> = {
  PLANNED: 'border-grey-mid text-grey-light',
  APPROVED: 'border-warning text-warning',
  ISSUED: 'border-success text-success',
  FULLY_ISSUED: 'border-success text-success',
}

export function TipsClient({ venueId }: { venueId: string }) {
  const [periods, setPeriods] = useState<TipsPeriod[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [pickerStaffId, setPickerStaffId] = useState('')

  const [label, setLabel] = useState('')
  const [fromDate, setFromDate] = useState(todayKey())
  const [toDate, setToDate] = useState(todayKey())
  const [cashCounts, setCashCounts] = useState<CashCounts>({})
  const [posTotal, setPosTotal] = useState('')
  const [shares, setShares] = useState<TipsShareRow[]>([])
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
    setShares(
      p && Array.isArray(p.shares)
        ? p.shares.map((s, i) => ({
            id: s.id,
            staffId: s.staffId ?? null,
            name: s.name,
            hours: Number(s.hours) || 0,
            shareWeight: Number(s.shareWeight) || 0,
            sortOrder: Number(s.sortOrder) || i,
            status: s.status,
            approvalNote: s.approvalNote ?? null,
            issueNote: s.issueNote ?? null,
          }))
        : [],
    )
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
    Promise.all([
      loadList(true),
      fetch(`/api/admin/tips/staff-options?venueId=${encodeURIComponent(venueId)}`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ])
      .then(([, staff]) => {
        if (active) setStaffOptions(Array.isArray(staff) ? staff : [])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [loadList, venueId])

  const locked = isTipsPeriodLocked(shares)
  const cashTotal = cashTotalOf(cashCounts)
  const grandTotal = totalTips(cashTotal, Number(posTotal) || 0)
  const values = valueTipsShares(grandTotal, shares)
  const progress = tipsProgress(shares)

  function setDenomination(denom: number, raw: string) {
    const qty = Math.max(0, Math.floor(Number(raw) || 0))
    setCashCounts((prev) => {
      const next = { ...prev }
      if (qty > 0) next[String(denom)] = qty
      else delete next[String(denom)]
      return next
    })
  }

  function updateShare(index: number, patch: Partial<TipsShareRow>) {
    setShares((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function addManualPerson() {
    setShares((prev) => [
      ...prev,
      {
        staffId: null,
        name: '',
        hours: 0,
        shareWeight: 1,
        sortOrder: prev.length,
        status: 'PLANNED',
      },
    ])
  }

  function addStaffMember() {
    if (!pickerStaffId) return
    const staff = staffOptions.find((s) => s.id === pickerStaffId)
    if (!staff) return
    if (shares.some((s) => s.staffId === staff.id)) {
      setError('THAT PERSON IS ALREADY ON THIS PERIOD')
      return
    }
    setShares((prev) => [
      ...prev,
      {
        staffId: staff.id,
        name: staff.name,
        hours: 0,
        shareWeight: 1,
        sortOrder: prev.length,
        status: 'PLANNED',
      },
    ])
    setPickerStaffId('')
    setError('')
  }

  function removeShare(index: number) {
    setShares((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, sortOrder: i })),
    )
  }

  async function refreshSelected(id: string) {
    const list = await loadList(false)
    applyPeriod(list.find((p) => p.id === id) ?? null)
  }

  async function approve(index: number) {
    const share = shares[index]
    if (!selectedId || !share.id) {
      setError('SAVE THE PERIOD BEFORE APPROVING SHARES')
      return
    }
    const note = typeof window !== 'undefined'
      ? window.prompt('APPROVAL NOTE (OPTIONAL)', '')
      : ''
    if (note === null) return
    const r = await fetch(`/api/admin/tips/${selectedId}/shares/${share.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'APPROVE', note }),
    }).catch(() => null)
    if (!r || !r.ok) {
      const body = r ? await r.json().catch(() => ({})) : {}
      setError(body.error || 'APPROVE FAILED')
      return
    }
    setShares((prev) =>
      prev.map((s, i) =>
        i === index ? { ...s, status: 'APPROVED', approvalNote: note.trim() || null } : s,
      ),
    )
    setError('')
    await refreshSelected(selectedId)
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
      notes,
      shares: shares.map((s, i) => ({
        id: s.id,
        staffId: s.staffId,
        name: s.name,
        hours: s.hours,
        shareWeight: s.shareWeight,
        sortOrder: i,
      })),
    }
    const r = await fetch(selectedId ? `/api/admin/tips/${selectedId}` : '/api/admin/tips', {
      method: selectedId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null)
    setSaving(false)
    if (!r || !r.ok) {
      const body = r ? await r.json().catch(() => ({})) : {}
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
            Pool split by share weight · cash-rounded to 10c · approve per person
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
            {locked && (
              <p className="border border-danger px-2 py-1 font-mono text-xs uppercase text-danger">
                LOCKED — SOME SHARES HAVE BEEN ISSUED. NO MORE EDITS.
              </p>
            )}
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
                        disabled={locked}
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
                disabled={locked}
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
                  <div className="font-mono text-sm text-white">{money(grandTotal)}</div>
                </div>
                <div>
                  <div className="font-mono text-xs uppercase text-grey-light">Share units</div>
                  <div className="font-mono text-sm text-white">
                    {shares.reduce((sum, s) => sum + (Number(s.shareWeight) || 0), 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-xs uppercase text-grey-light">Cash-rounded payouts</div>
                  <div className="font-mono text-sm text-white">
                    {money(values.reduce((sum, s) => sum + s.amount, 0))}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-xs uppercase text-grey-light">Rounding difference</div>
                  <div className="font-mono text-sm text-success">
                    {money(grandTotal - values.reduce((sum, s) => sum + s.amount, 0))}
                  </div>
                </div>
              </div>
              <div className="border-t border-grey-mid pt-3">
                <div className="mb-1 flex items-center justify-between font-mono text-xs uppercase text-grey-light">
                  <span>Issued {progress.issuedCount} / {progress.total}</span>
                  <span>{progress.percent}%</span>
                </div>
                <ProgressBar value={progress.issuedCount} max={Math.max(1, progress.total)} />
                <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs uppercase">
                  <span className="border border-grey-mid px-1.5 py-0.5 text-grey-light">
                    {progress.planned} PLANNED
                  </span>
                  <span className="border border-warning px-1.5 py-0.5 text-warning">
                    {progress.approved} APPROVED
                  </span>
                  <span className="border border-success px-1.5 py-0.5 text-success">
                    {progress.issued} ISSUED
                  </span>
                </div>
              </div>
              {selectedId && (
                <a
                  href={`/api/admin/tips/${selectedId}/pdf`}
                  className="inline-block border border-grey-mid px-3 py-1.5 font-mono text-xs uppercase text-white transition-colors hover:border-white"
                >
                  ⬇ DOWNLOAD DISTRIBUTION PDF
                </a>
              )}
            </Panel>
          </div>

          <Panel className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">Tips Breakdown</h2>
              <div className="flex flex-wrap items-end gap-2">
                <Select
                  value={pickerStaffId}
                  onChange={(e) => setPickerStaffId(e.target.value)}
                  disabled={locked}
                  options={[
                    { value: '', label: 'SELECT STAFF…' },
                    ...staffOptions
                      .filter((s) => !shares.some((row) => row.staffId === s.id))
                      .map((s) => ({ value: s.id, label: s.name })),
                  ]}
                  aria-label="Add staff member"
                />
                <Button size="sm" variant="ghost" onClick={addStaffMember} disabled={locked || !pickerStaffId}>
                  + ADD STAFF
                </Button>
                <Button size="sm" variant="ghost" onClick={addManualPerson} disabled={locked}>
                  + ADD PERSON
                </Button>
              </div>
            </div>
            {shares.length === 0 ? (
              <p className="font-mono text-sm text-grey-light">
                NOBODY ON THIS PERIOD YET — A NEW PERIOD AUTO-ADDS EVERY ACTIVE STAFF MEMBER.
              </p>
            ) : (
              <div className="space-y-1.5 overflow-x-auto">
                <div className="grid min-w-[54rem] grid-cols-[1fr_5rem_5rem_5rem_5rem_6rem_8rem_4rem] items-center gap-2 font-mono text-xs uppercase text-grey-light">
                  <span>Name</span>
                  <span>Hours</span>
                  <span>Weight</span>
                  <span>Hours %</span>
                  <span>Suggested</span>
                  <span className="text-right">Amount</span>
                  <span>Status</span>
                  <span />
                </div>
                {shares.map((s, i) => {
                  const value = values[i]
                  return (
                    <div
                      key={s.id ?? `new-${i}`}
                      className="grid min-w-[54rem] grid-cols-[1fr_5rem_5rem_5rem_5rem_6rem_8rem_4rem] items-center gap-2"
                    >
                      {s.staffId ? (
                        <span className="truncate font-mono text-xs uppercase text-white" title={s.name}>
                          {s.name}
                        </span>
                      ) : (
                        <Input
                          value={s.name}
                          onChange={(e) => updateShare(i, { name: e.target.value })}
                          placeholder="NAME"
                          disabled={locked}
                          aria-label={`Staff ${i + 1} name`}
                        />
                      )}
                      <Input
                        type="number"
                        min={0}
                        value={s.hours || ''}
                        onChange={(e) => updateShare(i, { hours: Number(e.target.value) || 0 })}
                        placeholder="0"
                        disabled={locked}
                        aria-label={`Staff ${i + 1} hours`}
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.05"
                        value={s.shareWeight || ''}
                        onChange={(e) => updateShare(i, { shareWeight: Number(e.target.value) || 0 })}
                        placeholder="0"
                        disabled={locked}
                        aria-label={`Staff ${i + 1} weight`}
                      />
                      <span className="font-mono text-xs text-grey-light">
                        {((value?.hoursShare ?? 0) * 100).toFixed(1)}%
                      </span>
                      <span className="font-mono text-xs text-grey-light" title="Hours-proportional suggestion">
                        {(value?.suggestedWeight ?? 0).toFixed(2)} / {money(value?.suggestedAmount ?? 0)}
                      </span>
                      <span className="text-right font-mono text-sm text-white">{money(value?.amount ?? 0)}</span>
                      <span
                        className={`border px-1.5 py-0.5 text-center font-mono text-xs uppercase ${
                          STATUS_TONE[s.status]
                        }`}
                      >
                        {s.status.replace('_', ' ')}
                      </span>
                      <div className="flex items-center justify-end gap-1">
                        {s.status === 'PLANNED' && (
                          <Button size="sm" variant="ghost" onClick={() => approve(i)} disabled={locked}>
                            APPROVE
                          </Button>
                        )}
                        {s.status === 'PLANNED' && (
                          <button
                            type="button"
                            onClick={() => removeShare(i)}
                            className="font-mono text-sm text-grey-light transition-colors hover:text-danger"
                            aria-label={`Remove staff ${i + 1}`}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          <Panel className="space-y-3">
            <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            {error && <p className="font-mono text-sm text-danger">{error}</p>}
            <div className="flex flex-wrap items-center gap-2 border-t border-grey-mid pt-3">
              <Button onClick={save} loading={saving} disabled={locked}>
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
