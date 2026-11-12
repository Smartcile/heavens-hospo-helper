'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { formatDateLong, mondayOf, shiftDay } from '@/lib/date-nav'

interface TemplateShiftRow {
  id: string
  staffId: string
  staffName: string | null
  positionName: string | null
  dayIndex: number
  startTime: string
  endTime: string
  breakMinutes: number
}

interface TemplateRow {
  id: string
  name: string
  notes: string | null
  createdAt: string
  shifts: TemplateShiftRow[]
}

interface ApplyResponse {
  created?: number
  replaced?: number
  skippedStaffIds?: string[]
  error?: string
}

const DAY = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export function RosterTemplatesModal({
  venueId,
  weekStart,
  onClose,
  onApplied,
}: {
  venueId: string
  weekStart: string
  onClose: () => void
  onApplied: () => void
}) {
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [targetWeek, setTargetWeek] = useState(() => shiftDay(weekStart, 7))
  const [mode, setMode] = useState<'ADD' | 'REPLACE'>('ADD')

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/admin/roster/templates?venueId=${venueId}`)
    const d = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) { setError((d.error ?? 'LOAD FAILED').toUpperCase()); return }
    setTemplates(Array.isArray(d.templates) ? d.templates : [])
  }, [venueId])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  async function saveCurrentWeek() {
    if (!name.trim()) { setError('NAME IS REQUIRED'); return }
    setBusy(true); setError(''); setNotice('')
    const r = await fetch('/api/admin/roster/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, name, notes, start: weekStart }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError((d.error ?? 'SAVE FAILED').toUpperCase()); return }
    setName(''); setNotes('')
    setNotice(`SAVED — ${d.shifts ?? 0} SHIFT${d.shifts === 1 ? '' : 'S'}`)
    loadTemplates()
  }

  async function applyTemplate(template: TemplateRow) {
    if (mode === 'REPLACE') {
      const ok = confirm(
        `REPLACE WILL DELETE EVERY SHIFT IN THE TARGET WEEK (${formatDateLong(targetWeek)}), INCLUDING PUBLISHED SHIFTS. CONTINUE?`,
      )
      if (!ok) return
    }
    setBusy(true); setError(''); setNotice('')
    const r = await fetch(`/api/admin/roster/templates/${template.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, weekStart: targetWeek, mode }),
    })
    const d = (await r.json().catch(() => ({}))) as ApplyResponse
    setBusy(false)
    if (!r.ok) {
      setError((d.error ?? 'APPLY FAILED').toUpperCase())
      return
    }
    const skipped = d.skippedStaffIds?.length ?? 0
    setNotice(
      `APPLIED ${template.name} — ${d.created ?? 0} CREATED${d.replaced ? ` · ${d.replaced} REPLACED` : ''}${skipped ? ` · ${skipped} STAFF SKIPPED` : ''}`,
    )
    onApplied()
  }

  async function removeTemplate(template: TemplateRow) {
    if (!confirm(`DELETE TEMPLATE "${template.name}"?`)) return
    setBusy(true); setError(''); setNotice('')
    const r = await fetch(`/api/admin/roster/templates/${template.id}`, { method: 'DELETE' })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError((d.error ?? 'DELETE FAILED').toUpperCase()); return }
    setNotice(`DELETED ${template.name}`)
    loadTemplates()
  }

  return (
    <Modal isOpen onClose={onClose} title="ROSTER TEMPLATES" size="lg">
      <div className="space-y-5">
        <div className="border border-grey-mid p-3 space-y-3">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">SAVE CURRENT WEEK</h3>
          <p className="font-mono text-2xs uppercase text-grey-light">
            CAPTURES {formatDateLong(weekStart)} → {formatDateLong(shiftDay(weekStart, 6))}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Template Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="SUMMER WEEK" />
            <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="OPTIONAL" />
          </div>
          <Button size="sm" onClick={saveCurrentWeek} loading={busy} disabled={!name.trim()}>SAVE AS TEMPLATE</Button>
        </div>

        <div className="border border-grey-mid p-3 space-y-3">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">APPLY TO A WEEK</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="Target Week (any day)" type="date" value={targetWeek} onChange={(e) => setTargetWeek(e.target.value ? mondayOf(e.target.value) : weekStart)} />
            <Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as 'ADD' | 'REPLACE')} options={[
              { value: 'ADD', label: 'ADD — KEEP EXISTING SHIFTS' },
              { value: 'REPLACE', label: 'REPLACE — CLEAR THE WEEK FIRST' },
            ]} />
          </div>
        </div>

        {error && <p className="font-mono text-xs text-danger">{error}</p>}
        {notice && <p className="font-mono text-xs text-success">{notice}</p>}

        <div className="space-y-2">
          <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">SAVED TEMPLATES</h3>
          {loading ? (
            <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
          ) : templates.length === 0 ? (
            <p className="font-mono text-xs text-grey-light">NO TEMPLATES YET.</p>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="border border-grey-mid p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs uppercase text-white">{t.name}</div>
                    <div className="font-mono text-2xs uppercase text-grey-light">
                      {t.shifts.length} SHIFT{t.shifts.length === 1 ? '' : 'S'}
                      {t.notes ? ` · ${t.notes}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => applyTemplate(t)} disabled={busy}>APPLY</Button>
                    <Button size="sm" variant="danger" onClick={() => removeTemplate(t)} disabled={busy}>DELETE</Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {t.shifts.slice(0, 8).map((s) => (
                    <span key={s.id} className="font-mono text-2xs uppercase border border-grey-mid px-1 py-0.5 text-grey-light">
                      {DAY[s.dayIndex]} {s.startTime}–{s.endTime} · {s.staffName ?? 'STAFF REMOVED'}
                    </span>
                  ))}
                  {t.shifts.length > 8 && <span className="font-mono text-2xs uppercase text-grey-light">+{t.shifts.length - 8} MORE</span>}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end border-t border-grey-mid pt-3">
          <Button size="sm" variant="ghost" onClick={onClose}>CLOSE</Button>
        </div>
      </div>
    </Modal>
  )
}
