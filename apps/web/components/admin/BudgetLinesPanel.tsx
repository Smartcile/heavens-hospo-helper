'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { BudgetImportModal } from '@/components/admin/BudgetImportModal'
import { buildLineTree, treeTotal } from '@/lib/budget-lines-import'
import type { LineTreeItem } from '@/lib/budget-lines-import'

interface ApiLine {
  id: string
  name: string
  kind: 'GROUP' | 'LINE' | 'TOTAL'
  parentId: string | null
  sectionId: string | null
  sectionName: string | null
  amount: number | null
  total: number | null
}

interface ApiSection { id: string; name: string; departmentId: string }

interface Props {
  venueId: string
  year: number
  month: number
}

function money(n: number | null | undefined) {
  if (n === null || n === undefined) return ''
  return `$${Math.round(n).toLocaleString('en-NZ', { maximumFractionDigits: 0 })}`
}

const INDENTS = ['', 'pl-4', 'pl-8', 'pl-12', 'pl-16']

function kindColour(kind: string): string {
  if (kind === 'GROUP') return 'text-[#FACC15]'
  if (kind === 'TOTAL') return 'text-success'
  return 'text-grey-light'
}

function LineRow({
  line,
  depth,
  sections,
  groupOptions,
  onSaved,
  onDeleted,
}: {
  line: ApiLine
  depth: number
  sections: ApiSection[]
  groupOptions: { id: string; name: string }[]
  onSaved: () => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(line.name)
  const [kind, setKind] = useState(line.kind)
  const [sectionId, setSectionId] = useState(line.sectionId ?? '')
  const [parentId, setParentId] = useState(line.parentId ?? '')
  const [amount, setAmount] = useState(line.amount != null ? String(line.amount) : '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(line.name)
    setKind(line.kind)
    setSectionId(line.sectionId ?? '')
    setParentId(line.parentId ?? '')
    setAmount(line.amount != null ? String(line.amount) : '')
  }, [line])

  async function save(patch: Record<string, unknown>) {
    setSaving(true)
    try {
      const r = await fetch(`/api/admin/budget-lines/${line.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (r.ok) onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`DELETE LINE: ${line.name}?`)) return
    const r = await fetch(`/api/admin/budget-lines/${line.id}`, { method: 'DELETE' })
    if (r.ok) onDeleted()
  }

  const inputClass = 'bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light'

  return (
    <div
      className={`grid grid-cols-[1fr_84px_150px_140px_110px_30px] gap-2 items-center py-1 border-b border-grey-mid/40 ${
        line.kind === 'GROUP' ? 'bg-grey-dark/30' : ''
      }`}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() !== line.name && save({ name })}
        placeholder="NAME"
        className={`${inputClass} ${INDENTS[Math.min(depth, INDENTS.length - 1)]} ${
          line.kind === 'GROUP' ? 'font-bold' : ''
        }`}
      />
      <select
        value={kind}
        onChange={(e) => {
          const next = e.target.value
          setKind(next as ApiLine['kind'])
          if (next !== line.kind) save({ kind: next })
        }}
        className={`bg-black border border-grey-mid font-mono text-xs px-1 py-1.5 outline-none focus:border-white ${kindColour(kind)}`}
      >
        <option value="LINE" className="text-white">LINE</option>
        <option value="GROUP" className="text-white">GROUP</option>
        <option value="TOTAL" className="text-white">TOTAL</option>
      </select>
      <select
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
        onBlur={() => parentId !== (line.parentId ?? '') && save({ parentId: parentId || null })}
        className="bg-black border border-grey-mid text-white font-mono text-xs px-1 py-1.5 outline-none focus:border-white"
      >
        <option value="">—</option>
        {groupOptions.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <select
        value={sectionId}
        onChange={(e) => setSectionId(e.target.value)}
        onBlur={() => sectionId !== (line.sectionId ?? '') && save({ sectionId: sectionId || null })}
        className="bg-black border border-grey-mid text-white font-mono text-xs px-1 py-1.5 outline-none focus:border-white"
      >
        <option value="">—</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {line.kind === 'TOTAL' ? (
        <span className="font-mono text-sm text-success text-right">{money(line.total)}</span>
      ) : (
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => {
            const next = Number(amount) || 0
            if (next !== (line.amount ?? 0) && line.kind === 'LINE') save({ amount: next })
          }}
          placeholder="0"
          disabled={line.kind !== 'LINE'}
          className={`${inputClass} text-right disabled:opacity-40`}
        />
      )}
      <button onClick={handleDelete} disabled={saving} className="font-mono text-xs text-danger hover:text-white px-1">
        ✕
      </button>
    </div>
  )
}

function renderRows(
  nodes: LineTreeItem[],
  sections: ApiSection[],
  groupOptions: { id: string; name: string }[],
  onSaved: () => void,
  onDeleted: () => void,
  depth = 0
): ReactNode {
  return nodes.map((node) => (
    <div key={node.id}>
      <LineRow
        line={{
          id: node.id,
          name: node.name,
          kind: node.kind,
          parentId: node.parentId,
          sectionId: node.sectionId,
          sectionName: node.sectionName,
          amount: node.amount,
          total: node.total,
        }}
        depth={depth}
        sections={sections}
        groupOptions={groupOptions}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
      {node.children.length > 0 && renderRows(node.children, sections, groupOptions, onSaved, onDeleted, depth + 1)}
    </div>
  ))
}

export function BudgetLinesPanel({ venueId, year, month }: Props) {
  const [lines, setLines] = useState<ApiLine[]>([])
  const [sections, setSections] = useState<ApiSection[]>([])
  const [loading, setLoading] = useState(true)
  const [sectionFilter, setSectionFilter] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [adding, setAdding] = useState<'GROUP' | 'LINE' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ venueId, year: String(year), month: String(month) })
    const r = await fetch(`/api/admin/budget-lines?${params}`)
    const data = await r.json()
    setLines(data.lines ?? [])
    setSections(data.sections ?? [])
    setLoading(false)
  }, [venueId, year, month])

  useEffect(() => { load() }, [load])

  async function addLine(kind: 'GROUP' | 'LINE') {
    setAdding(kind)
    try {
      await fetch('/api/admin/budget-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, year, month, name: `NEW ${kind}`, kind, amount: 0 }),
      })
      await load()
    } finally {
      setAdding(null)
    }
  }

  const groupOptions = lines.filter((l) => l.kind === 'GROUP').map((l) => ({ id: l.id, name: l.name }))
  const filtered = sectionFilter ? lines.filter((l) => l.sectionId === sectionFilter) : lines
  const tree = buildLineTree(filtered)
  const venueTotal = treeTotal(tree)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>⇩ IMPORT FROM EXCEL</Button>
        <Button size="sm" variant="ghost" onClick={() => addLine('GROUP')} loading={adding === 'GROUP'}>+ ADD GROUP</Button>
        <Button size="sm" variant="ghost" onClick={() => addLine('LINE')} loading={adding === 'LINE'}>+ ADD LINE</Button>
        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
        >
          <option value="">ALL SECTIONS</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {message && <span className="font-mono text-xs text-success">{message}</span>}
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : lines.length === 0 ? (
        <div className="border border-grey-mid p-4 text-center space-y-2">
          <p className="font-mono text-xs text-grey-light">NO P&amp;L LINES FOR THIS MONTH.</p>
          <p className="font-mono text-xs text-grey-light">IMPORT AN EXCEL P&amp;L BUDGET OR ADD LINES MANUALLY.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_84px_150px_140px_110px_30px] gap-2 px-2 pb-1">
            <span className="font-mono text-xs uppercase text-grey-light tracking-wider">NAME</span>
            <span className="font-mono text-xs uppercase text-grey-light tracking-wider">KIND</span>
            <span className="font-mono text-xs uppercase text-grey-light tracking-wider">PARENT</span>
            <span className="font-mono text-xs uppercase text-grey-light tracking-wider">SECTION</span>
            <span className="font-mono text-xs uppercase text-grey-light tracking-wider text-right">AMOUNT</span>
            <span />
          </div>
          {renderRows(tree, sections, groupOptions, load, load)}
          <div className="border-t border-grey-mid pt-2 flex items-center justify-between">
            <span className="font-mono text-xs text-grey-light">
              {filtered.length} LINES{sectionFilter ? ' (FILTERED)' : ''}
            </span>
            <span className="font-mono text-sm text-white">
              VENUE TOTAL: <span className="text-success">{money(venueTotal)}</span>
            </span>
          </div>
        </>
      )}

      <BudgetImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        venueId={venueId}
        year={year}
        sections={sections}
        onDone={(msg) => { setMessage(msg); setImportOpen(false); load() }}
      />
    </div>
  )
}
