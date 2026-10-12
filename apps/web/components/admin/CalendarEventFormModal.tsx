'use client'

// Create / edit a manual calendar event — title, area, date/time, pax, PDF
// (upload + external link) and required staff lines. Shared by the Calendar
// planner and the roster EVENTS tab.

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { isOverCapacity } from '@/lib/manual-event'
import {
  draftFromStaffingLine,
  newStaffingDraft,
  staffingPayload,
  StaffingLinesEditor,
  type StaffingDraftLine,
} from '@/components/admin/StaffingLinesEditor'

interface AreaOption {
  id: string
  name: string
  capacity: number | null
  floorPlanName: string | null
}

interface PositionOption {
  id: string
  name: string
}

function utcDateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function utcTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function CalendarEventFormModal({
  venueId,
  eventId,
  defaultDate,
  defaultAreaId,
  onClose,
  onSaved,
}: {
  venueId: string
  eventId?: string | null
  defaultDate?: string
  defaultAreaId?: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!eventId
  const [loading, setLoading] = useState(editing)
  const [areas, setAreas] = useState<AreaOption[]>([])
  const [positions, setPositions] = useState<PositionOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [areaId, setAreaId] = useState(defaultAreaId ?? '')
  const [date, setDate] = useState(defaultDate ?? todayKey())
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [pax, setPax] = useState('')
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [removePdf, setRemovePdf] = useState(false)
  const [draftLines, setDraftLines] = useState<StaffingDraftLine[]>([newStaffingDraft()])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [areasR, posR] = await Promise.all([
        fetch(`/api/admin/areas?venueId=${venueId}`),
        fetch(`/api/admin/positions?venueId=${venueId}`),
      ])
      if (!alive) return
      const areasD = await areasR.json().catch(() => null)
      const posD = await posR.json().catch(() => null)
      if (alive) {
        setAreas(
          (areasD?.areas ?? [])
            .filter((a: { isActive?: boolean }) => a.isActive !== false)
            .map((a: { id: string; name: string; capacity: number | null; floorPlan?: { name: string } | null }) => ({
              id: a.id,
              name: a.name,
              capacity: a.capacity,
              floorPlanName: a.floorPlan?.name ?? null,
            })),
        )
        setPositions(Array.isArray(posD) ? posD.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) : [])
      }

      if (!eventId) return
      const r = await fetch(`/api/admin/calendar-events/${eventId}`)
      const d = await r.json().catch(() => null)
      if (!alive) return
      if (!r.ok || !d?.event) {
        setError((d?.error ?? 'COULD NOT LOAD EVENT').toUpperCase())
        setLoading(false)
        return
      }
      const ev = d.event as {
        title: string
        description: string | null
        areaId: string | null
        startsAt: string
        endsAt: string | null
        allDay: boolean
        pax: number | null
        pdfUrl: string | null
        pdfPath: string | null
        staffing: { id: string; positionId: string | null; label: string | null; count: number; startTime: string; endTime: string; breakMinutes: number; note: string | null }[]
      }
      const startsAt = new Date(ev.startsAt)
      const endsAt = ev.endsAt ? new Date(ev.endsAt) : null
      setTitle(ev.title)
      setDescription(ev.description ?? '')
      setAreaId(ev.areaId ?? '')
      setDate(utcDateKey(startsAt))
      setAllDay(ev.allDay)
      setStartTime(utcTime(startsAt))
      setEndTime(endsAt ? utcTime(endsAt) : '17:00')
      setPax(ev.pax === null || ev.pax === undefined ? '' : String(ev.pax))
      setPdfUrl(ev.pdfUrl ?? '')
      setPdfPath(ev.pdfPath)
      const staff = d.staffing as { id: string; positionId: string | null; label: string | null; count: number; startTime: string; endTime: string; breakMinutes: number; note: string | null }[] | undefined
      setDraftLines(staff && staff.length > 0 ? staff.map(draftFromStaffingLine) : [newStaffingDraft()])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [venueId, eventId])

  const selectedArea = useMemo(() => areas.find((a) => a.id === areaId) ?? null, [areas, areaId])
  const paxNum = pax.trim() === '' ? null : Number(pax)
  const overCapacity = isOverCapacity(paxNum, selectedArea?.capacity ?? null)

  async function save() {
    if (!title.trim()) { setError('TITLE IS REQUIRED'); return }
    if (!date) { setError('A DATE IS REQUIRED'); return }
    setBusy(true)
    setError('')

    const body = {
      venueId,
      title: title.trim(),
      description: description.trim() || null,
      areaId: areaId || null,
      date,
      startTime: allDay ? '00:00' : startTime,
      endTime: allDay ? null : endTime || null,
      allDay,
      pax: paxNum,
      pdfUrl: pdfUrl.trim() || null,
      staffing: staffingPayload(draftLines),
    }

    const r = editing
      ? await fetch(`/api/admin/calendar-events/${eventId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      : await fetch('/api/admin/calendar-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) {
      setBusy(false)
      setError((d.error ?? 'SAVE FAILED').toUpperCase())
      return
    }
    const id: string = editing ? (eventId as string) : d.event?.id
    if (id && pdfFile) {
      const form = new FormData()
      form.append('file', pdfFile)
      const up = await fetch(`/api/admin/calendar-events/${id}/attachment`, { method: 'POST', body: form })
      if (!up.ok) {
        const ud = await up.json().catch(() => ({}))
        setBusy(false)
        setError((ud.error ?? 'PDF UPLOAD FAILED').toUpperCase())
        onSaved()
        return
      }
    } else if (id && removePdf && !pdfFile) {
      await fetch(`/api/admin/calendar-events/${id}/attachment`, { method: 'DELETE' })
    }
    setBusy(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-grey-dark border border-grey-mid p-5 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-mono text-xs uppercase tracking-widest text-white">
          {editing ? 'EDIT EVENT' : 'NEW EVENT'}
        </h2>

        {loading ? (
          <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
        ) : (
          <>
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="BOARD MEETING" />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Area"
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                options={[{ value: '', label: 'NO AREA' }, ...areas.map((a) => ({ value: a.id, label: a.name }))]}
              />
              <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {selectedArea?.floorPlanName && (
              <p className="font-mono text-2xs uppercase text-grey-light">LAYOUT: {selectedArea.floorPlanName}</p>
            )}
            <div className="flex items-center gap-2">
              <input
                id="event-allday"
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="accent-white"
              />
              <label htmlFor="event-allday" className="font-mono text-2xs uppercase text-grey-light">ALL DAY</label>
            </div>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                <Input label="End" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input label="PAX" type="number" min="0" value={pax} onChange={(e) => setPax(e.target.value)} placeholder="GUESTS" />
                {overCapacity && (
                  <p className="font-mono text-2xs uppercase text-warning mt-1">
                    OVER CAPACITY — {selectedArea?.name} SEATS {selectedArea?.capacity}
                  </p>
                )}
              </div>
              <Input label="PDF link (external)" value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} placeholder="https://…" />
            </div>
            <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="OPTIONAL" />
            <div className="space-y-1">
              <label className="font-mono text-xs uppercase text-grey-light block">PDF upload (25MB max)</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  setPdfFile(e.target.files?.[0] ?? null)
                  setRemovePdf(false)
                }}
                className="block w-full font-mono text-2xs text-grey-light file:mr-2 file:border file:border-grey-mid file:bg-transparent file:text-white file:font-mono file:text-2xs file:uppercase file:px-2 file:py-1"
              />
              {pdfPath && !pdfFile && (
                <div className="flex items-center gap-2">
                  <a href={pdfPath} target="_blank" rel="noreferrer" className="font-mono text-2xs uppercase text-accent hover:text-white">
                    CURRENT PDF ↗
                  </a>
                  {!removePdf ? (
                    <button type="button" onClick={() => setRemovePdf(true)} className="font-mono text-2xs uppercase text-grey-light hover:text-danger">
                      REMOVE
                    </button>
                  ) : (
                    <button type="button" onClick={() => setRemovePdf(false)} className="font-mono text-2xs uppercase text-warning">
                      WILL REMOVE ON SAVE — UNDO
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="border border-grey-mid p-3 space-y-3">
              <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">REQUIRED STAFF</h3>
              <StaffingLinesEditor lines={draftLines} positions={positions} onChange={setDraftLines} />
              <Button size="sm" variant="ghost" onClick={() => setDraftLines((prev) => [...prev, newStaffingDraft()])}>
                + ADD ROLE
              </Button>
            </div>
          </>
        )}

        {error && <p className="font-mono text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={save} loading={busy} disabled={loading || !title.trim()}>
            {editing ? 'SAVE' : 'CREATE EVENT'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>CANCEL</Button>
        </div>
      </div>
    </div>
  )
}
