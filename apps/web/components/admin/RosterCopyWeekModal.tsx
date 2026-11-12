'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { formatDateLong, mondayOf, shiftDay } from '@/lib/date-nav'

export function RosterCopyWeekModal({
  venueId,
  sourceStart,
  onClose,
  onDone,
}: {
  venueId: string
  sourceStart: string
  onClose: () => void
  onDone: () => void
}) {
  const [targetStart, setTargetStart] = useState(() => shiftDay(sourceStart, 7))
  const [mode, setMode] = useState<'ADD' | 'REPLACE'>('ADD')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function copyWeek() {
    if (mode === 'REPLACE') {
      const ok = confirm(
        `REPLACE WILL DELETE EVERY SHIFT IN THE TARGET WEEK (${formatDateLong(mondayOf(targetStart))}), INCLUDING PUBLISHED SHIFTS. CONTINUE?`,
      )
      if (!ok) return
    }
    setBusy(true); setError(''); setNotice('')
    const r = await fetch('/api/admin/roster/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, sourceStart, targetStart, mode }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setError((d.error ?? 'COPY FAILED').toUpperCase()); return }
    const skipped = d.skippedStaffIds?.length ?? 0
    setNotice(
      `COPIED — ${d.created ?? 0} CREATED${d.replaced ? ` · ${d.replaced} REPLACED` : ''}${skipped ? ` · ${skipped} STAFF SKIPPED` : ''}`,
    )
    onDone()
  }

  const targetWeek = mondayOf(targetStart)

  return (
    <Modal isOpen onClose={onClose} title="COPY WEEK" size="md">
      <div className="space-y-4">
        <div className="border border-grey-mid p-3 space-y-1">
          <div className="font-mono text-2xs uppercase text-grey-light">COPY FROM</div>
          <div className="font-mono text-xs text-white">{formatDateLong(sourceStart)} → {formatDateLong(shiftDay(sourceStart, 6))}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Target Week (any day)" type="date" value={targetStart} onChange={(e) => setTargetStart(e.target.value || shiftDay(sourceStart, 7))} />
          <Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as 'ADD' | 'REPLACE')} options={[
            { value: 'ADD', label: 'ADD — KEEP EXISTING SHIFTS' },
            { value: 'REPLACE', label: 'REPLACE — CLEAR THE WEEK FIRST' },
          ]} />
        </div>
        <p className="font-mono text-2xs uppercase text-grey-light">
          TARGET WEEK: {formatDateLong(targetWeek)} → {formatDateLong(shiftDay(targetWeek, 6))} · SHIFTS ARE CREATED AS DRAFT.
        </p>
        {error && <p className="font-mono text-xs text-danger">{error}</p>}
        {notice && <p className="font-mono text-xs text-success">{notice}</p>}
        <div className="flex gap-2 border-t border-grey-mid pt-3">
          <Button size="sm" onClick={copyWeek} loading={busy}>COPY WEEK</Button>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>CLOSE</Button>
        </div>
      </div>
    </Modal>
  )
}
