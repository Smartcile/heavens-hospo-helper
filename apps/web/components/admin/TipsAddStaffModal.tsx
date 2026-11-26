'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import type { TipsShareRow, TipsStaffOption } from '@/lib/tips'

/**
 * Bulk staff entry (#180): pick many people at once instead of one dropdown
 * choice at a time. People already on the period are shown but disabled; the
 * parent merges the selection with the pure `mergeTipsStaff`.
 */
export function TipsAddStaffModal({
  staff,
  shares,
  onAdd,
  onClose,
}: {
  staff: TipsStaffOption[]
  shares: readonly TipsShareRow[]
  onAdd: (people: TipsStaffOption[]) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [department, setDepartment] = useState('')

  const addedIds = useMemo(
    () => new Set(shares.map((s) => s.staffId).filter((id): id is string => !!id)),
    [shares],
  )
  const departments = useMemo(() => {
    const names = new Set<string>()
    for (const person of staff) if (person.departmentName) names.add(person.departmentName)
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [staff])

  const visible = staff.filter(
    (person) => !department || person.departmentName === department,
  )
  const selectable = visible.filter((person) => !addedIds.has(person.id))
  const selectedCount = selectable.filter((person) => selected.has(person.id)).length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(selectable.map((person) => person.id)))
  }

  function selectNone() {
    setSelected(new Set())
  }

  function addSelected() {
    const people = selectable.filter((person) => selected.has(person.id))
    if (people.length === 0) return
    onAdd(people)
    onClose()
  }

  function addAllActive() {
    const people = staff.filter((person) => !addedIds.has(person.id))
    if (people.length === 0) return
    onAdd(people)
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="ADD STAFF TO THIS PERIOD" size="lg">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <Select
            label="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            options={[
              { value: '', label: 'ALL DEPARTMENTS' },
              ...departments.map((name) => ({ value: name, label: name })),
            ]}
            aria-label="Filter by department"
          />
          <Button size="sm" variant="ghost" onClick={selectAll} disabled={selectable.length === 0}>
            SELECT ALL
          </Button>
          <Button size="sm" variant="ghost" onClick={selectNone} disabled={selected.size === 0}>
            NONE
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto border border-grey-mid divide-y divide-grey-mid">
          {visible.length === 0 ? (
            <p className="p-3 font-mono text-xs uppercase text-grey-light">NO STAFF MATCH THIS FILTER.</p>
          ) : (
            visible.map((person) => {
              const added = addedIds.has(person.id)
              return (
                <label
                  key={person.id}
                  className={`flex items-center gap-2 px-3 py-2 ${added ? 'opacity-50' : 'cursor-pointer hover:bg-grey-dark/40'}`}
                >
                  <input
                    type="checkbox"
                    checked={added || selected.has(person.id)}
                    disabled={added}
                    onChange={() => toggle(person.id)}
                    aria-label={`Select ${person.name}`}
                    className="accent-white"
                  />
                  <span className="font-mono text-xs uppercase text-white">{person.name}</span>
                  {person.departmentName && (
                    <span className="font-mono text-2xs uppercase text-grey-light">{person.departmentName}</span>
                  )}
                  {added && (
                    <span className="ml-auto font-mono text-2xs uppercase text-grey-light">ON PERIOD</span>
                  )}
                </label>
              )
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-grey-mid pt-3">
          <Button size="sm" onClick={addSelected} disabled={selectedCount === 0}>
            ADD SELECTED ({selectedCount})
          </Button>
          <Button size="sm" variant="ghost" onClick={addAllActive} disabled={staff.every((p) => addedIds.has(p.id))}>
            ADD ALL ACTIVE
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            CANCEL
          </Button>
        </div>
      </div>
    </Modal>
  )
}
