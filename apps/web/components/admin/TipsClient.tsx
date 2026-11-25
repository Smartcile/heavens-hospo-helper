'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Panel } from '@/components/ui/Panel'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Textarea } from '@/components/ui/Textarea'
import { ImportModal } from '@/components/import/ImportModal'
import { TipsAddStaffModal } from '@/components/admin/TipsAddStaffModal'
import { TipsNoteThread } from '@/components/tips/TipsNoteThread'
import {
  applyTipsImport,
  buildTipsImportPrompt,
  matchTipsImportRows,
  parseTipsImportAnswer,
  type TipsImportValues,
} from '@/lib/import/tips'
import {
  CASH_DENOMINATIONS,
  DEFAULT_TIPS_COLUMN_ORDER,
  TIPS_COLUMNS,
  cashTotalOf,
  denominationLabel,
  isTipsPeriodLocked,
  mergeTipsStaff,
  moveTipsColumn,
  parseTipsColumnOrder,
  sortTipsShares,
  tipsColumnOrderStorageKey,
  tipsProgress,
  totalTips,
  valueTipsShares,
  type CashCounts,
  type TipsColumnKey,
  type TipsShareRow,
  type TipsShareStatusValue,
  type TipsShareValue,
  type TipsSort,
  type TipsSortKey,
  type TipsStaffOption,
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

type StaffOption = TipsStaffOption

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

const COLUMN_BY_KEY = Object.fromEntries(TIPS_COLUMNS.map((c) => [c.key, c])) as Record<
  TipsColumnKey,
  (typeof TIPS_COLUMNS)[number]
>

const SORT_KEY_BY_COLUMN: Partial<Record<TipsColumnKey, TipsSortKey>> = {
  NAME: 'name',
  DEPARTMENT: 'department',
  HOURS: 'hours',
  WEIGHT: 'weight',
}

type DisplayRow = {
  share: TipsShareRow
  index: number
  value: TipsShareValue
  name: string
  hours: number
  shareWeight: number
  departmentName: string | null
}

export function TipsClient({ venueId }: { venueId: string }) {
  const [periods, setPeriods] = useState<TipsPeriod[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [noteShare, setNoteShare] = useState<{ id: string; name: string } | null>(null)

  const [label, setLabel] = useState('')
  const [fromDate, setFromDate] = useState(todayKey())
  const [toDate, setToDate] = useState(todayKey())
  const [cashCounts, setCashCounts] = useState<CashCounts>({})
  const [posTotal, setPosTotal] = useState('')
  const [shares, setShares] = useState<TipsShareRow[]>([])
  const [notes, setNotes] = useState('')

  const [columnOrder, setColumnOrder] = useState<TipsColumnKey[]>(DEFAULT_TIPS_COLUMN_ORDER)
  const [dragColumn, setDragColumn] = useState<TipsColumnKey | null>(null)
  const [sort, setSort] = useState<TipsSort | null>(null)
  const [includeNotes, setIncludeNotes] = useState(false)

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
            departmentName: s.departmentName ?? null,
            noteCount: Number(s.noteCount) || 0,
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

  // Column order is a per-venue client preference; no schema, no API.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.localStorage.getItem(tipsColumnOrderStorageKey(venueId))
      setColumnOrder(parseTipsColumnOrder(saved))
    } catch {
      setColumnOrder(DEFAULT_TIPS_COLUMN_ORDER)
    }
  }, [venueId])

  function persistColumnOrder(next: TipsColumnKey[]) {
    setColumnOrder(next)
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(tipsColumnOrderStorageKey(venueId), JSON.stringify(next))
    } catch {
      // A private-mode browser can refuse storage; the in-session order still works.
    }
  }

  function resetColumnOrder() {
    setColumnOrder(DEFAULT_TIPS_COLUMN_ORDER)
    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(tipsColumnOrderStorageKey(venueId))
    } catch {
      // ignore
    }
  }

  function dropColumn(target: TipsColumnKey) {
    if (dragColumn && dragColumn !== target) {
      persistColumnOrder(moveTipsColumn(columnOrder, dragColumn, target))
    }
    setDragColumn(null)
  }

  const locked = isTipsPeriodLocked(shares)
  const cashTotal = cashTotalOf(cashCounts)
  const grandTotal = totalTips(cashTotal, Number(posTotal) || 0)
  const values = useMemo(() => valueTipsShares(grandTotal, shares), [grandTotal, shares])
  const progress = tipsProgress(shares)

  const displayRows = useMemo<DisplayRow[]>(() => {
    const enriched: DisplayRow[] = shares.map((share, index) => ({
      share,
      index,
      value: values[index],
      name: share.name,
      hours: share.hours,
      shareWeight: share.shareWeight,
      departmentName: share.departmentName ?? null,
    }))
    return sortTipsShares(enriched, sort)
  }, [shares, values, sort])

  function toggleSort(column: TipsColumnKey) {
    const key = SORT_KEY_BY_COLUMN[column]
    if (!key) return
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  /** The distribution PDF follows the on-screen order — forward the active sort. */
  function pdfHref(): string {
    const params = new URLSearchParams()
    if (includeNotes) params.set('notes', '1')
    if (sort) {
      params.set('sort', sort.key)
      params.set('dir', sort.dir)
    }
    const query = params.toString()
    return `/api/admin/tips/${selectedId}/pdf${query ? `?${query}` : ''}`
  }

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
        departmentName: null,
      },
    ])
  }

  function addStaffMembers(people: TipsStaffOption[]) {
    const { shares: next, added } = mergeTipsStaff(shares, people)
    setShares(next)
    setError(added > 0 ? '' : 'THOSE PEOPLE ARE ALREADY ON THIS PERIOD')
  }

  function removeShare(index: number) {
    setShares((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, sortOrder: i })),
    )
  }

  function openNotes(share: TipsShareRow, index: number) {
    if (!share.id || !selectedId) {
      setError('SAVE THE PERIOD BEFORE ADDING NOTES')
      return
    }
    setNoteShare({ id: share.id, name: share.name || `STAFF ${index + 1}` })
  }

  function updateNoteCount(shareId: string, count: number) {
    setShares((prev) => prev.map((s) => (s.id === shareId ? { ...s, noteCount: count } : s)))
    setPeriods((prev) =>
      prev.map((p) =>
        p.id !== selectedId
          ? p
          : { ...p, shares: p.shares.map((s) => (s.id === shareId ? { ...s, noteCount: count } : s)) },
      ),
    )
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
    // Keep the rest of the form exactly as typed: approval only changes this
    // row. Re-hydrating from the server here would silently discard unsaved
    // hours / cash / POS / notes edits in the same session.
    setPeriods((prev) =>
      prev.map((p) => {
        if (p.id !== selectedId) return p
        return {
          ...p,
          shares: p.shares.map((row) =>
            row.id === share.id
              ? { ...row, status: 'APPROVED' as const, approvalNote: note.trim() || null }
              : row,
          ),
        }
      }),
    )
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

  function cell(row: DisplayRow, key: TipsColumnKey) {
    const s = row.share
    const i = row.index
    const value = row.value
    switch (key) {
      case 'NAME':
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            {s.staffId ? (
              <span className="min-w-0 truncate font-mono text-xs uppercase text-white" title={s.name}>
                {s.name}
              </span>
            ) : (
              <Input
                value={s.name}
                onChange={(e) => updateShare(i, { name: e.target.value })}
                placeholder="NAME"
                disabled={locked}
                aria-label={`Staff ${i + 1} name`}
                className="min-w-0"
              />
            )}
            <button
              type="button"
              onClick={() => openNotes(s, i)}
              disabled={!s.id || !selectedId}
              title={s.id ? 'NOTES' : 'SAVE FIRST'}
              aria-label={`Notes for ${s.name || `Staff ${i + 1}`}`}
              className="flex h-6 shrink-0 items-center gap-0.5 border border-grey-mid px-1 font-mono text-2xs text-grey-light transition-colors hover:border-white hover:text-white disabled:opacity-30"
            >
              ✎
              {(s.noteCount ?? 0) > 0 && <span className="text-success">{s.noteCount}</span>}
            </button>
          </div>
        )
      case 'DEPARTMENT': {
        const department = s.departmentName?.trim()
        return (
          <span className="font-mono text-xs uppercase text-grey-light">
            {department ? department : '—'}
          </span>
        )
      }
      case 'HOURS':
        return (
          <Input
            type="number"
            min={0}
            value={s.hours || ''}
            onChange={(e) => updateShare(i, { hours: Number(e.target.value) || 0 })}
            placeholder="0"
            disabled={locked}
            aria-label={`Staff ${i + 1} hours`}
            className="w-20 text-right"
          />
        )
      case 'WEIGHT':
        return (
          <Input
            type="number"
            min={0}
            step="0.05"
            value={s.shareWeight || ''}
            onChange={(e) => updateShare(i, { shareWeight: Number(e.target.value) || 0 })}
            placeholder="0"
            disabled={locked}
            aria-label={`Staff ${i + 1} weight`}
            className="w-20 text-right"
          />
        )
      case 'HOURS_PCT':
        return (
          <span className="font-mono text-xs text-grey-light">
            {((value?.hoursShare ?? 0) * 100).toFixed(1)}%
          </span>
        )
      case 'SUGGESTED':
        return (
          <span className="font-mono text-xs text-grey-light" title="Hours-proportional suggestion">
            {(value?.suggestedWeight ?? 0).toFixed(2)} / {money(value?.suggestedAmount ?? 0)}
          </span>
        )
      case 'AMOUNT':
        return <span className="font-mono text-sm text-white">{money(value?.amount ?? 0)}</span>
      case 'STATUS':
        return (
          <span className={`border px-1.5 py-0.5 text-center font-mono text-xs uppercase ${STATUS_TONE[s.status]}`}>
            {s.status.replace('_', ' ')}
          </span>
        )
      case 'ACTIONS':
        return (
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
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
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

        <section className="min-w-0 space-y-4">
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
                LOCKED — SOME SHARES HAVE BEEN ISSUED. NO MORE EDITS. NOTES REMAIN EDITABLE.
              </p>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
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
                aria-label="EFTPOS / POS holding (from finance)"
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
                <div className="flex flex-wrap items-center gap-3 border-t border-grey-mid pt-3">
                  <a
                    href={pdfHref()}
                    className="inline-block border border-grey-mid px-3 py-1.5 font-mono text-xs uppercase text-white transition-colors hover:border-white"
                  >
                    ⬇ DOWNLOAD DISTRIBUTION PDF
                  </a>
                  <label className="flex cursor-pointer items-center gap-1.5 font-mono text-xs uppercase text-grey-light">
                    <input
                      type="checkbox"
                      checked={includeNotes}
                      onChange={(e) => setIncludeNotes(e.target.checked)}
                      aria-label="Include notes in PDF"
                      className="accent-white"
                    />
                    INCLUDE NOTES
                  </label>
                </div>
              )}
            </Panel>
          </div>

          <Panel className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-mono text-xs uppercase tracking-wider text-grey-light">Tips Breakdown</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)} disabled={locked}>
                  + ADD STAFF
                </Button>
                <Button size="sm" variant="ghost" onClick={addManualPerson} disabled={locked}>
                  + ADD PERSON
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)} disabled={locked}>
                  ⬆ IMPORT HOURS
                </Button>
                <Button size="sm" variant="ghost" onClick={resetColumnOrder}>
                  RESET ORDER
                </Button>
              </div>
            </div>
            <p className="font-mono text-2xs uppercase text-grey-light">
              CLICK A HEADER TO SORT · DRAG A HEADER TO MOVE THE COLUMN · ORDER IS REMEMBERED FOR THIS VENUE.
            </p>
            {shares.length === 0 ? (
              <p className="font-mono text-sm text-grey-light">
                NOBODY ON THIS PERIOD YET — A NEW PERIOD AUTO-ADDS EVERY ACTIVE STAFF MEMBER.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-black">
                    <tr className="border-b border-grey-mid">
                      {columnOrder.map((key) => {
                        const column = COLUMN_BY_KEY[key]
                        const sortable = !!SORT_KEY_BY_COLUMN[key]
                        const active = sort?.key === SORT_KEY_BY_COLUMN[key]
                        return (
                          <th
                            key={key}
                            scope="col"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer?.setData('text/plain', key)
                              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
                              setDragColumn(key)
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => { e.preventDefault(); dropColumn(key) }}
                            onDragEnd={() => setDragColumn(null)}
                            className={`whitespace-nowrap px-2 py-2 font-mono text-xs uppercase tracking-wider ${
                              column.numeric ? 'text-right' : 'text-left'
                            } ${column.key === 'NAME' ? 'w-full' : ''} ${
                              dragColumn === key ? 'text-white' : 'text-grey-light'
                            } ${dragColumn ? 'cursor-grabbing' : 'cursor-grab'}`}
                            title="DRAG TO REORDER"
                          >
                            {sortable ? (
                              <button
                                type="button"
                                onClick={() => toggleSort(key)}
                                className={`uppercase tracking-wider transition-colors hover:text-white ${
                                  active ? 'text-white' : ''
                                }`}
                              >
                                {column.label}
                                <span aria-hidden className="ml-1">
                                  {active ? (sort?.dir === 'asc' ? '▲' : '▼') : '↕'}
                                </span>
                              </button>
                            ) : (
                              column.label
                            )}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row) => (
                      <tr
                        key={row.share.id ?? `new-${row.index}`}
                        className="border-b border-grey-mid/60 align-middle"
                      >
                        {columnOrder.map((key) => (
                          <td
                            key={key}
                            className={`px-2 py-1.5 ${COLUMN_BY_KEY[key].numeric ? 'text-right' : 'text-left'}`}
                          >
                            {cell(row, key)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
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

      {pickerOpen && (
        <TipsAddStaffModal
          staff={staffOptions}
          shares={shares}
          onAdd={addStaffMembers}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {noteShare && selectedId && (
        <Modal isOpen onClose={() => setNoteShare(null)} title={`NOTES — ${noteShare.name}`} size="md">
          <TipsNoteThread
            periodId={selectedId}
            shareId={noteShare.id}
            onChanged={(count) => updateNoteCount(noteShare.id, count)}
          />
        </Modal>
      )}

      {importOpen && (
        <ImportModal<TipsImportValues>
          title="IMPORT TIP HOURS"
          prompt={buildTipsImportPrompt({
            staffNames: staffOptions.map((s) => s.name),
            fromDate,
            toDate,
          })}
          existing={staffOptions.map((s) => ({ id: s.id, name: s.name }))}
          renderSummary={(v) => ({
            title: v.name,
            meta: `${v.hours} HRS${v.weight != null ? ` · W ${v.weight}` : ''}`,
          })}
          parse={(text, existing) => {
            const result = parseTipsImportAnswer(text)
            if ('error' in result) return result
            const onPeriod = shares
              .map((s) => s.staffId)
              .filter((id): id is string => !!id)
            return { ...result, rows: matchTipsImportRows(result.rows, existing, onPeriod) }
          }}
          onApply={(rows) => {
            const result = applyTipsImport(rows, shares)
            setShares(result.shares)
            return result.summary
          }}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            // Draft already updated by onApply; keep the summary on screen.
          }}
        />
      )}
    </div>
  )
}
