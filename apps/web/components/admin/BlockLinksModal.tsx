'use client'

// Attach playbook references (guides / tasks / checklists) to one BEO block area.
// Works for built-in and custom areas alike — links live in `BeoBlockLink`, keyed
// by block type, so a built-in area needs no def row.

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface Target { id: string; name: string }
interface Targets { guides: Target[]; tasks: Target[]; checklists: Target[] }

const inputClass =
  'w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light'

function TargetList({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: Target[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  const [filter, setFilter] = useState('')
  const shown = filter.trim()
    ? options.filter((o) => o.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : options

  return (
    <div className="border border-grey-mid">
      <div className="px-2 py-1.5 border-b border-grey-mid bg-grey-dark/40 flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase text-white tracking-wider">{title}</span>
        <span className="font-mono text-[9px] uppercase text-grey-light">{selected.size} SELECTED</span>
      </div>
      <div className="p-2 space-y-1">
        <input
          className={inputClass}
          placeholder={`SEARCH ${title}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="max-h-40 overflow-y-auto space-y-0.5 pt-1">
          {shown.length === 0 ? (
            <p className="font-mono text-[10px] uppercase text-grey-light py-2 text-center">NOTHING TO LINK.</p>
          ) : (
            shown.map((o) => (
              <label key={o.id} className="flex items-center gap-2 px-1 py-1 hover:bg-grey-dark/40 cursor-pointer">
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => onToggle(o.id)} />
                <span className="font-mono text-[10px] uppercase text-white truncate">{o.name}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export function BlockLinksModal({
  venueId,
  blockType,
  label,
  onClose,
  onSaved,
}: {
  venueId: string
  blockType: string
  label: string
  onClose: () => void
  onSaved: () => void
}) {
  const [targets, setTargets] = useState<Targets>({ guides: [], tasks: [], checklists: [] })
  const [guides, setGuides] = useState<Set<string>>(new Set())
  const [tasks, setTasks] = useState<Set<string>>(new Set())
  const [checklists, setChecklists] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const [tRes, lRes] = await Promise.all([
          fetch(`/api/admin/beo-references?venueId=${venueId}`),
          fetch(`/api/admin/beo-block-links?venueId=${venueId}&blockType=${blockType}`),
        ])
        if (!alive) return
        if (tRes.ok) {
          const t = (await tRes.json()) as Targets
          setTargets({ guides: t.guides ?? [], tasks: t.tasks ?? [], checklists: t.checklists ?? [] })
        }
        if (lRes.ok) {
          const rows = (await lRes.json()) as { kind: string; targetId: string }[]
          setGuides(new Set(rows.filter((r) => r.kind === 'GUIDE').map((r) => r.targetId)))
          setTasks(new Set(rows.filter((r) => r.kind === 'TASK').map((r) => r.targetId)))
          setChecklists(new Set(rows.filter((r) => r.kind === 'CHECKLIST').map((r) => r.targetId)))
        }
      } catch {
        /* pickers degrade to empty */
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [venueId, blockType])

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  async function save() {
    setSaving(true)
    setError('')
    const r = await fetch('/api/admin/beo-block-links', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId,
        blockType,
        guideIds: [...guides],
        taskIds: [...tasks],
        checklistIds: [...checklists],
      }),
    })
    setSaving(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(String(d.error ?? 'COULD NOT SAVE LINKS').toUpperCase())
      return
    }
    onSaved()
  }

  return (
    <Modal isOpen onClose={onClose} title={`REFERENCES — ${label}`} size="lg">
      <div className="space-y-3">
        <p className="font-mono text-[10px] uppercase text-grey-light">
          THESE APPEAR AS A REFERENCE BUTTON WHILE SOMEONE FILLS THIS AREA.
        </p>
        {loading ? (
          <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TargetList title="GUIDES" options={targets.guides} selected={guides} onToggle={(id) => setGuides((s) => toggle(s, id))} />
            <TargetList title="TASKS" options={targets.tasks} selected={tasks} onToggle={(id) => setTasks((s) => toggle(s, id))} />
            <TargetList title="CHECKLISTS" options={targets.checklists} selected={checklists} onToggle={(id) => setChecklists((s) => toggle(s, id))} />
          </div>
        )}
        {error && <p className="font-mono text-xs text-danger uppercase">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>CANCEL</Button>
          <Button size="sm" onClick={save} loading={saving}>SAVE REFERENCES</Button>
        </div>
      </div>
    </Modal>
  )
}
