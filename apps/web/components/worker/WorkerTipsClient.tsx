'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Panel } from '@/components/ui/Panel'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { TipsProgress, TipsShareValue } from '@/lib/tips'

interface WorkerNote {
  id: string
  body: string
  createdAt: string
}

type TipsShareWithNotes = TipsShareValue & { notes?: WorkerNote[] }

interface TipsPeriodView {
  id: string
  label: string | null
  fromDate: string
  toDate: string
  notes: string | null
  fullyIssuedAt: string | null
  poolTotal: number
  progress: TipsProgress
  shares: TipsShareWithNotes[]
}

function money(n: number): string {
  const value = Number.isFinite(n) ? n : 0
  return `$${value.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const day = (iso: string) => (iso ? iso.slice(0, 10) : '')

const STATUS_TONE: Record<string, string> = {
  PLANNED: 'border-grey-mid text-grey-light',
  APPROVED: 'border-warning text-warning',
  ISSUED: 'border-success text-success',
  FULLY_ISSUED: 'border-success text-success',
}

export function WorkerTipsClient() {
  const [periods, setPeriods] = useState<TipsPeriodView[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [showNotes, setShowNotes] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (withNotes: boolean) => {
    const r = await fetch(`/api/worker/tips${withNotes ? '?notes=1' : ''}`).catch(() => null)
    if (!r) {
      setError('COULD NOT CONNECT')
      setLoading(false)
      return
    }
    if (r.status === 403) {
      setError('ACCESS DENIED — MANAGERS ONLY')
      setLoading(false)
      return
    }
    if (!r.ok) {
      setError('COULD NOT LOAD TIPS')
      setLoading(false)
      return
    }
    const data = await r.json().catch(() => ({ periods: [] }))
    const list: TipsPeriodView[] = Array.isArray(data?.periods) ? data.periods : []
    setPeriods(list)
    setSelectedId((prev) => {
      if (prev && list.some((p) => p.id === prev)) return prev
      return list[0]?.id ?? null
    })
    setError('')
    setLoading(false)
  }, [])

  useEffect(() => {
    void load(showNotes)
  }, [load, showNotes])

  async function issue(share: TipsShareValue) {
    setBusyId(share.id ?? null)
    setError('')
    const r = await fetch(`/api/worker/tips/${share.id}/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: notes[share.id ?? ''] ?? '' }),
    }).catch(() => null)
    setBusyId(null)
    if (!r || !r.ok) {
      const body = r ? await r.json().catch(() => ({})) : {}
      setError(body.error || 'COULD NOT MARK ISSUED')
      return
    }
    setNotes((prev) => {
      const next = { ...prev }
      delete next[share.id ?? '']
      return next
    })
    await load(showNotes)
  }

  const selected = periods.find((p) => p.id === selectedId) ?? periods[0] ?? null

  return (
    <div className="min-h-screen bg-black p-4 pb-24">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">TIPS</h1>
            <p className="font-mono text-xs uppercase tracking-wider text-grey-light">
              MANAGER ISSUANCE DESK — MARK EACH PERSON AS PAID
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes((prev) => !prev)}
            aria-pressed={showNotes}
            className="h-9 border border-grey-mid px-3 font-mono text-xs uppercase text-grey-light transition-colors hover:border-white hover:text-white"
          >
            {showNotes ? 'HIDE NOTES' : 'SHOW NOTES'}
          </button>
        </div>

        {loading ? (
          <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
        ) : error && periods.length === 0 ? (
          <Panel>
            <p className="font-mono text-sm text-danger">{error}</p>
          </Panel>
        ) : periods.length === 0 ? (
          <Panel>
            <p className="font-mono text-sm text-grey-light">NO TIPS PERIODS YET.</p>
          </Panel>
        ) : (
          <>
            {periods.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {periods.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`border px-2 py-1 font-mono text-xs uppercase transition-colors ${
                      p.id === selected?.id
                        ? 'border-white bg-grey-dark text-white'
                        : 'border-grey-mid text-grey-light hover:border-white'
                    }`}
                  >
                    {p.label || `${day(p.fromDate)} → ${day(p.toDate)}`}
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <Panel className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-mono text-sm font-bold uppercase text-white">
                      {selected.label || `${day(selected.fromDate)} → ${day(selected.toDate)}`}
                    </h2>
                    <p className="font-mono text-xs text-grey-light">
                      {day(selected.fromDate)} → {day(selected.toDate)} · POOL {money(selected.poolTotal)}
                    </p>
                  </div>
                  <span
                    className={`border px-2 py-1 font-mono text-xs uppercase ${
                      STATUS_TONE[selected.progress.stage] ?? STATUS_TONE.PLANNED
                    }`}
                  >
                    {selected.progress.stage.replace('_', ' ')}
                  </span>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between font-mono text-xs uppercase text-grey-light">
                    <span>ISSUED</span>
                    <span>
                      {selected.progress.issuedCount} / {selected.progress.total}
                    </span>
                  </div>
                  <ProgressBar value={selected.progress.issuedCount} max={Math.max(1, selected.progress.total)} />
                </div>

                {selected.progress.stage === 'FULLY_ISSUED' && (
                  <p className="border border-success px-3 py-2 font-mono text-xs uppercase text-success">
                    FULLY ISSUED — EVERY PERSON HAS BEEN MARKED PAID.
                  </p>
                )}

                <div className="space-y-2">
                  {selected.shares.length === 0 ? (
                    <p className="font-mono text-sm text-grey-light">NOBODY ON THIS PERIOD YET.</p>
                  ) : (
                    selected.shares.map((share) => (
                      <div key={share.id} className="border border-grey-mid p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-mono text-sm font-bold uppercase text-white">{share.name}</span>
                            <span className="ml-2 font-mono text-xs text-grey-light">
                              {share.departmentName ? `${share.departmentName} · ` : ''}
                              {share.hours} HRS · WEIGHT {share.shareWeight}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-white">{money(share.amount)}</span>
                            <span
                              className={`border px-1.5 py-0.5 font-mono text-xs uppercase ${
                                STATUS_TONE[share.status] ?? STATUS_TONE.PLANNED
                              }`}
                            >
                              {share.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>

                        {share.approvalNote && (
                          <p className="mt-1 font-mono text-xs text-grey-light">APPROVAL: {share.approvalNote}</p>
                        )}
                        {share.issueNote && (
                          <p className="mt-1 font-mono text-xs text-grey-light">ISSUE: {share.issueNote}</p>
                        )}

                        {showNotes && (
                          share.notes && share.notes.length > 0 ? (
                            <div className="mt-1 space-y-0.5 border-l border-grey-mid pl-2">
                              {share.notes.map((note) => (
                                <p key={note.id} className="font-mono text-xs text-grey-light">
                                  {note.body}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 font-mono text-xs text-grey-light">NO NOTES.</p>
                          )
                        )}

                        {share.status === 'APPROVED' && (
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                            <Input
                              label="Note (optional)"
                              value={notes[share.id ?? ''] ?? ''}
                              onChange={(e) =>
                                setNotes((prev) => ({ ...prev, [share.id ?? '']: e.target.value }))
                              }
                              placeholder="CASH HANDED"
                              aria-label={`Issue note for ${share.name}`}
                            />
                            <Button
                              onClick={() => issue(share)}
                              loading={busyId === share.id}
                              disabled={!!busyId}
                            >
                              MARK ISSUED
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {error && <p className="font-mono text-sm text-danger">{error}</p>}
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  )
}
