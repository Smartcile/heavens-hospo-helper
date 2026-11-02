'use client'

// Shared required-staff line editor — used by the manual event form and the
// roster's event staffing modal, so the two can never drift.

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

export interface StaffingLineLike {
  id: string
  positionId: string | null
  label: string | null
  count: number
  startTime: string
  endTime: string
  breakMinutes: number
  note: string | null
}

export interface StaffingDraftLine {
  key: string
  positionId: string
  label: string
  count: string
  startTime: string
  endTime: string
  breakMinutes: string
  note: string
}

export function draftFromStaffingLine(line: StaffingLineLike, i: number): StaffingDraftLine {
  return {
    key: line.id || `line-${i}`,
    positionId: line.positionId ?? '',
    label: line.label ?? '',
    count: String(line.count),
    startTime: line.startTime,
    endTime: line.endTime,
    breakMinutes: String(line.breakMinutes),
    note: line.note ?? '',
  }
}

export function newStaffingDraft(startTime = '09:00', endTime = '17:00'): StaffingDraftLine {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    positionId: '',
    label: '',
    count: '1',
    startTime,
    endTime,
    breakMinutes: '0',
    note: '',
  }
}

/** Rows that name a role, mapped to the staffing API's line shape. */
export function staffingPayload(lines: StaffingDraftLine[]) {
  return lines
    .filter((l) => l.positionId || l.label.trim())
    .map((l, i) => ({
      id: l.key,
      positionId: l.positionId || null,
      label: l.label.trim() || null,
      count: Number(l.count) || 1,
      startTime: l.startTime,
      endTime: l.endTime,
      breakMinutes: Number(l.breakMinutes) || 0,
      note: l.note.trim() || null,
      sortOrder: i,
    }))
}

export function staffingLineCount(lines: StaffingDraftLine[]): number {
  return lines
    .filter((l) => l.positionId || l.label.trim())
    .reduce((n, l) => n + (Number(l.count) || 1), 0)
}

export function StaffingLinesEditor({
  lines,
  positions,
  onChange,
  disabled,
}: {
  lines: StaffingDraftLine[]
  positions: { id: string; name: string }[]
  onChange: (lines: StaffingDraftLine[]) => void
  disabled?: boolean
}) {
  const patch = (i: number, part: Partial<StaffingDraftLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...part } : l)))

  return (
    <div className="space-y-2">
      {lines.length === 0 && (
        <p className="font-mono text-2xs uppercase text-grey-light">NO ROLES YET — ADD THE POSITIONS THIS EVENT NEEDS.</p>
      )}
      {lines.map((line, i) => (
        <div key={line.key} className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3">
            <Select
              label="Position"
              value={line.positionId}
              disabled={disabled}
              onChange={(e) => patch(i, { positionId: e.target.value })}
              options={[{ value: '', label: 'CUSTOM LABEL' }, ...positions.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </div>
          <div className="col-span-3">
            <Input
              label="Label"
              value={line.label}
              placeholder="IF NO POSITION"
              disabled={disabled}
              onChange={(e) => patch(i, { label: e.target.value })}
            />
          </div>
          <div className="col-span-1">
            <Input
              label="#"
              type="number"
              min="1"
              value={line.count}
              disabled={disabled}
              onChange={(e) => patch(i, { count: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Input
              label="Start"
              type="time"
              value={line.startTime}
              disabled={disabled}
              onChange={(e) => patch(i, { startTime: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Input
              label="End"
              type="time"
              value={line.endTime}
              disabled={disabled}
              onChange={(e) => patch(i, { endTime: e.target.value })}
            />
          </div>
          <div className="col-span-1 flex justify-end">
            <Button size="sm" variant="danger" disabled={disabled} onClick={() => onChange(lines.filter((_, j) => j !== i))}>
              ✕
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
