'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import {
  buildMenuImportPrompt,
  createImportDraft,
  draftToImportData,
  importMatchIssues,
  matchImportItems,
  moveImportGroup,
  moveImportItem,
  normaliseMenuName,
  optionSummary,
  parseMenuImportAnswer,
  renameImportGroup,
  renameImportItem,
  reorderImportItem,
  setImportGroupArea,
  type MenuImportDraft,
  type MenuImportDraftItem,
  type MenuImportParseResult,
  type MenuImportSummary,
} from '@/lib/menu-import'

interface ProductLite { id: string; name: string }
interface MenuLite { id: string; name: string }

export function MenuImportModal({
  venueId,
  menus,
  products,
  onClose,
  onImported,
}: {
  venueId: string
  menus: MenuLite[]
  products: ProductLite[]
  onClose: () => void
  onImported: (menuId: string) => void
}) {
  const [answer, setAnswer] = useState('')
  const [parsed, setParsed] = useState<MenuImportParseResult | null>(null)
  const [draft, setDraft] = useState<MenuImportDraft | null>(null)
  const [include, setInclude] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<'new' | 'existing'>('new')
  const [newName, setNewName] = useState('')
  const [menuId, setMenuId] = useState('')
  const [copied, setCopied] = useState(false)
  const [summary, setSummary] = useState<MenuImportSummary | null>(null)

  const prompt = useMemo(
    () => buildMenuImportPrompt({ menuNameHint: draft?.name }),
    [draft?.name],
  )

  const draftItems = useMemo(
    () => draft?.groups.flatMap((group) => group.items) ?? [],
    [draft],
  )
  const matches = useMemo(
    () => (draft ? matchImportItems(draftItems, products) : new Map<string, 'MATCH' | 'NEW' | 'AMBIGUOUS'>()),
    [draft, draftItems, products],
  )
  const matchIssues = useMemo(
    () => (draft ? importMatchIssues(draftItems, products) : []),
    [draft, draftItems, products],
  )
  const includedCount = draftItems.filter((item) => include[item.id]).length

  function copyPrompt() {
    void navigator.clipboard?.writeText(prompt).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500) },
      () => setError('COULD NOT COPY — SELECT THE TEXT MANUALLY'),
    )
  }

  function downloadPrompt() {
    const blob = new Blob([prompt], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'menu-import-prompt.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function loadFile(file: File | null | undefined) {
    if (!file) return
    setAnswer(await file.text())
    setParsed(null)
    setDraft(null)
    setSummary(null)
    setError('')
  }

  function parseAnswer() {
    const result = parseMenuImportAnswer(answer)
    if ('error' in result) {
      setError(result.error)
      setParsed(null)
      setDraft(null)
      return
    }
    const nextDraft = createImportDraft(result.data)
    setParsed(result)
    setDraft(nextDraft)
    setSummary(null)
    setError('')
    setNewName(result.data.name)
    const next: Record<string, boolean> = {}
    for (const group of nextDraft.groups) {
      for (const item of group.items) {
        // Include a row when it has a base price OR size prices — a size-only
        // product must not be silently dropped.
        next[item.id] = item.price != null || item.sizes.length > 0
      }
    }
    setInclude(next)
  }

  function toggle(itemId: string) {
    setInclude((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  function updateDraft(next: MenuImportDraft) {
    setDraft(next)
  }

  async function commit() {
    if (!draft) return
    const selected = draftItems.filter((item) => include[item.id])
    if (selected.length === 0) { setError('INCLUDE AT LEAST ONE ITEM'); return }

    const seen = new Set<string>()
    for (const item of selected) {
      const key = normaliseMenuName(item.name)
      if (!key) { setError('EVERY ITEM NEEDS A NAME'); return }
      if (seen.has(key)) { setError(`DUPLICATE ITEM NAME "${key}"`); return }
      seen.add(key)
    }

    if (target === 'existing' && !menuId) { setError('PICK AN EXISTING MENU'); return }
    if (target === 'new' && !newName.trim()) { setError('NAME THE NEW MENU'); return }

    const data = draftToImportData(draft, (id) => !!include[id])
    if (data.groups.length === 0) { setError('INCLUDE AT LEAST ONE ITEM'); return }

    setBusy(true)
    setError('')
    const r = await fetch('/api/admin/menus/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId,
        ...(target === 'existing' ? { menuId } : { menuName: newName.trim() }),
        data: {
          ...data,
          name: newName.trim() || data.name,
        },
      }),
    })
    setBusy(false)
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      setError(String(d.error ?? 'IMPORT FAILED').toUpperCase())
      return
    }
    const out = await r.json().catch(() => ({}))
    setSummary({
      menuId: String(out.menuId ?? menuId ?? ''),
      created: Number(out.created ?? 0),
      matched: Number(out.matched ?? 0),
      linesAdded: Number(out.linesAdded ?? 0),
      linesUpdated: Number(out.linesUpdated ?? 0),
      skipped: Number(out.skipped ?? 0),
      optionGroupsAdded: Number(out.optionGroupsAdded ?? 0),
      optionChoicesAdded: Number(out.optionChoicesAdded ?? 0),
      optionsSkipped: Number(out.optionsSkipped ?? 0),
      warnings: Array.isArray(out.warnings) ? out.warnings.map(String) : [],
    })
  }

  return (
    <Modal isOpen onClose={onClose} title="IMPORT MENU FROM A PDF" size="xl">
      <div className="space-y-4">
        <p className="font-mono text-2xs uppercase text-grey-light">
          COPY THE PROMPT INTO AN LLM WITH THE PDF MENU ATTACHED, THEN PASTE ITS JSON ANSWER BACK HERE.
          NOTHING IS SENT FROM THIS APP.
        </p>

        <div className="border border-grey-mid p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-grey-light">1 · PROMPT</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={copyPrompt}>{copied ? 'COPIED_' : 'COPY PROMPT'}</Button>
              <Button size="sm" variant="ghost" onClick={downloadPrompt}>⬇ .MD</Button>
            </div>
          </div>
          <textarea
            readOnly
            value={prompt}
            rows={8}
            aria-label="Menu import prompt"
            className="w-full bg-black border border-grey-mid text-grey-light font-mono text-2xs p-2 outline-none"
          />
        </div>

        <div className="border border-grey-mid p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-grey-light">2 · PASTE THE ANSWER</span>
            <label className="font-mono text-2xs uppercase text-grey-light hover:text-white cursor-pointer border border-grey-mid px-2 py-1">
              LOAD FILE
              <input
                type="file"
                accept=".json,.md,.txt,text/plain,application/json"
                className="sr-only"
                onChange={(e) => void loadFile(e.target.files?.[0])}
              />
            </label>
          </div>
          <textarea
            value={answer}
            onChange={(e) => {
              setAnswer(e.target.value)
              setParsed(null)
              setDraft(null)
              setSummary(null)
            }}
            rows={7}
            placeholder="PASTE THE LLM'S JSON HERE..."
            aria-label="Pasted LLM answer"
            className="w-full bg-black border border-grey-mid text-white font-mono text-xs p-2 outline-none focus:border-white"
          />
          <Button size="sm" onClick={parseAnswer} disabled={!answer.trim()}>PARSE ANSWER</Button>
        </div>

        {error && <p className="font-mono text-xs text-danger">{error}</p>}

        {summary && (
          <div className="border border-grey-mid p-3 space-y-3">
            <span className="font-mono text-2xs uppercase tracking-wider text-grey-light">IMPORT SUMMARY</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryStat label="CREATED" value={summary.created} />
              <SummaryStat label="MATCHED" value={summary.matched} />
              <SummaryStat label="LINES ADDED" value={summary.linesAdded} />
              <SummaryStat label="LINES UPDATED" value={summary.linesUpdated} />
              <SummaryStat label="OPTION GROUPS ADDED" value={summary.optionGroupsAdded} />
              <SummaryStat label="OPTION CHOICES ADDED" value={summary.optionChoicesAdded} />
              <SummaryStat label="OPTIONS SKIPPED" value={summary.optionsSkipped} />
              <SummaryStat label="ITEMS SKIPPED" value={summary.skipped} />
            </div>
            <div className="border border-warning/60 bg-warning/10 px-2 py-1.5 space-y-0.5">
              {summary.warnings.length === 0 && (
                <p className="font-mono text-2xs uppercase text-warning">NO WARNINGS</p>
              )}
              {summary.warnings.map((warning, i) => (
                <p key={i} className="font-mono text-2xs uppercase text-warning">{warning}</p>
              ))}
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => onImported(summary.menuId)}>DONE</Button>
            </div>
          </div>
        )}

        {!summary && draft && parsed && (
          <div className="border border-grey-mid p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-2xs uppercase tracking-wider text-grey-light">3 · PREVIEW</span>
              <span className="font-mono text-2xs uppercase text-white">{includedCount} OF {draftItems.length} SELECTED</span>
            </div>

            <div className="border border-warning/60 bg-warning/10 px-2 py-1.5 space-y-0.5">
              <p className="font-mono text-2xs uppercase text-warning">
                DIETARY NOT IMPORTED — ALLERGENS COME FROM THE PRODUCT
              </p>
              <p className="font-mono text-2xs uppercase text-warning">
                OPTIONS ARE IMPORTED — EXISTING PRODUCTS GAIN ONLY MISSING GROUPS/CHOICES
              </p>
              {[
                ...parsed.issues.filter((issue) => issue.kind !== 'DIETARY_IGNORED'),
                ...matchIssues,
              ].map((issue, i) => (
                <p key={i} className="font-mono text-2xs uppercase text-warning">{issue.message}</p>
              ))}
            </div>

            <div className="space-y-3">
              {draft.groups.map((group, groupIndex) => (
                <div key={group.id} className="border border-grey-mid">
                  <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 bg-grey-mid/20 border-b border-grey-mid">
                    <input
                      value={group.name}
                      onChange={(e) => updateDraft(renameImportGroup(draft, group.id, e.target.value))}
                      aria-label={`Group name ${group.id}`}
                      className="bg-black border border-grey-mid text-white font-mono text-xs uppercase px-2 py-1 outline-none focus:border-white min-w-0 flex-1"
                    />
                    <label className="flex items-center gap-1 font-mono text-2xs uppercase text-grey-light">
                      AREA
                      <input
                        value={group.area ?? ''}
                        onChange={(e) => updateDraft(setImportGroupArea(draft, group.id, e.target.value))}
                        aria-label={`Group area ${group.id}`}
                        placeholder="—"
                        className="bg-black border border-grey-mid text-white font-mono text-2xs uppercase px-2 py-1 outline-none focus:border-white w-32"
                      />
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Move group ${group.id} up`}
                      disabled={groupIndex === 0}
                      onClick={() => updateDraft(moveImportGroup(draft, group.id, -1))}
                    >
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Move group ${group.id} down`}
                      disabled={groupIndex === draft.groups.length - 1}
                      onClick={() => updateDraft(moveImportGroup(draft, group.id, 1))}
                    >
                      ↓
                    </Button>
                  </div>
                  <div className="divide-y divide-grey-mid">
                    {group.items.map((item, itemIndex) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        group={group}
                        groups={draft.groups}
                        groupIndex={groupIndex}
                        itemIndex={itemIndex}
                        itemsInGroup={group.items.length}
                        include={!!include[item.id]}
                        match={matches.get(item.name)}
                        onToggle={() => toggle(item.id)}
                        onRename={(name) => updateDraft(renameImportItem(draft, item.id, name))}
                        onMoveTo={(targetGroupId) => updateDraft(moveImportItem(draft, item.id, targetGroupId))}
                        onMoveUp={() => updateDraft(reorderImportItem(draft, item.id, -1))}
                        onMoveDown={() => updateDraft(reorderImportItem(draft, item.id, 1))}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-grey-mid pt-3 space-y-2">
              <span className="font-mono text-2xs uppercase tracking-wider text-grey-light">4 · TARGET MENU</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTarget('new')}
                  className={`font-mono text-xs uppercase px-3 py-1.5 border ${target === 'new' ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}
                >
                  NEW MENU
                </button>
                <button
                  type="button"
                  onClick={() => setTarget('existing')}
                  disabled={menus.length === 0}
                  className={`font-mono text-xs uppercase px-3 py-1.5 border disabled:opacity-40 ${target === 'existing' ? 'bg-white text-black border-white' : 'text-grey-light border-grey-mid hover:border-white hover:text-white'}`}
                >
                  ADD TO EXISTING
                </button>
              </div>
              {target === 'new' ? (
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.toUpperCase())}
                  placeholder="NEW MENU NAME"
                  aria-label="New menu name"
                  className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white"
                />
              ) : (
                <Select
                  value={menuId}
                  onChange={(e) => setMenuId(e.target.value)}
                  options={menus.map((m) => ({ value: m.id, label: m.name }))}
                  placeholder="SELECT MENU"
                />
              )}
              <p className="font-mono text-2xs uppercase text-grey-light">
                NEW PRODUCTS HAVE NO RECIPE YET — SET ONE UP IN RECIPES → IMPORT PRODUCTS.
                EXISTING PRODUCTS KEEP THEIR CURRENT PRICE, DESCRIPTION AND ALLERGENS.
                RE-IMPORTING MOVES EXISTING LINES INTO THE EDITED GROUPS INSTEAD OF DUPLICATING THEM.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={commit} loading={busy} disabled={includedCount === 0}>
                IMPORT {includedCount} ITEM{includedCount === 1 ? '' : 'S'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>CANCEL</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-2xs uppercase text-grey-light mb-0.5">{label}</div>
      <div className="font-mono text-sm text-white">{value}</div>
    </div>
  )
}

function ItemRow({
  item,
  group,
  groups,
  groupIndex,
  itemIndex,
  itemsInGroup,
  include,
  match,
  onToggle,
  onRename,
  onMoveTo,
  onMoveUp,
  onMoveDown,
}: {
  item: MenuImportDraftItem
  group: { id: string; name: string }
  groups: { id: string; name: string }[]
  groupIndex: number
  itemIndex: number
  itemsInGroup: number
  include: boolean
  match?: 'MATCH' | 'NEW' | 'AMBIGUOUS'
  onToggle: () => void
  onRename: (name: string) => void
  onMoveTo: (targetGroupId: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div className="px-2 py-1.5 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          checked={include}
          onChange={onToggle}
          aria-label={`Include ${item.id}`}
          className="accent-white"
        />
        <input
          value={item.name}
          onChange={(e) => onRename(e.target.value)}
          aria-label={`Item name ${item.id}`}
          className="bg-black border border-grey-mid text-white font-mono text-xs uppercase px-2 py-1 outline-none focus:border-white min-w-0 flex-1"
        />
        <span className="font-mono text-xs text-grey-light shrink-0">
          {item.price != null ? `$${item.price.toFixed(2)}` : 'NO PRICE'}
        </span>
        {match && (
          <span className={`font-mono text-2xs uppercase border px-1 shrink-0 ${
            match === 'NEW' ? 'text-success border-success'
              : match === 'MATCH' ? 'text-info border-info'
                : 'text-warning border-warning'
          }`}>
            {match}
          </span>
        )}
        <Button size="sm" variant="ghost" aria-label={`Move item ${item.id} up`} disabled={itemIndex === 0} onClick={onMoveUp}>↑</Button>
        <Button size="sm" variant="ghost" aria-label={`Move item ${item.id} down`} disabled={itemIndex === itemsInGroup - 1} onClick={onMoveDown}>↓</Button>
        <select
          value={group.id}
          onChange={(e) => onMoveTo(e.target.value)}
          aria-label={`Move item ${item.id}`}
          className="bg-black border border-grey-mid text-white font-mono text-2xs uppercase px-1 py-1 outline-none focus:border-white"
        >
          {groups.map((g, i) => (
            <option key={g.id} value={g.id}>{i === groupIndex ? `${g.name} (HERE)` : g.name}</option>
          ))}
        </select>
      </div>

      <div className="pl-6 space-y-0.5">
        {item.sizes.length > 0 && (
          <p className="font-mono text-2xs uppercase text-grey-light">
            SIZES: {item.sizes.map((s) => `${s.label} $${s.price.toFixed(2)}`).join(' / ')}
          </p>
        )}
        {item.options.length > 0 && (
          <div className="space-y-0.5">
            {item.options.map((option) => (
              <p key={option.name} className="font-mono text-2xs uppercase text-info">
                OPTION · {optionSummary(option)}
              </p>
            ))}
          </div>
        )}
        {item.sizes.length === 0 && item.options.length === 0 && (
          <p className="font-mono text-2xs uppercase text-grey-light">NO SIZES OR OPTIONS DETECTED</p>
        )}
      </div>
    </div>
  )
}
