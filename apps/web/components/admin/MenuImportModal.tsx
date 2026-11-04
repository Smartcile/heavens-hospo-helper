'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import {
  buildMenuImportPrompt,
  flattenMenuImport,
  matchImportItems,
  parseMenuImportAnswer,
  type MenuImportItem,
  type MenuImportParseResult,
} from '@/lib/menu-import'

interface ProductLite { id: string; name: string }
interface MenuLite { id: string; name: string }

function keyOf(group: string, item: string) {
  return `${group}::${item}`
}

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
  const [include, setInclude] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<'new' | 'existing'>('new')
  const [newName, setNewName] = useState('')
  const [menuId, setMenuId] = useState('')
  const [copied, setCopied] = useState(false)

  const prompt = useMemo(
    () => buildMenuImportPrompt({ menuNameHint: parsed?.data.name }),
    [parsed?.data.name],
  )

  const flat = parsed ? flattenMenuImport(parsed.data) : []
  const matches = parsed
    ? matchImportItems(flat.map((r) => r.item), products)
    : new Map<string, 'MATCH' | 'NEW' | 'AMBIGUOUS'>()
  const includedCount = parsed
    ? flat.filter(({ group, item }) => include[keyOf(group, item.name)]).length
    : 0

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
    setError('')
  }

  function parseAnswer() {
    const result = parseMenuImportAnswer(answer)
    if ('error' in result) {
      setError(result.error)
      setParsed(null)
      return
    }
    setParsed(result)
    setError('')
    setNewName(result.data.name)
    const next: Record<string, boolean> = {}
    for (const { group, item } of flattenMenuImport(result.data)) {
      next[keyOf(group, item.name)] = item.price != null
    }
    setInclude(next)
  }

  function toggle(group: string, item: string) {
    const k = keyOf(group, item)
    setInclude((prev) => ({ ...prev, [k]: !prev[k] }))
  }

  async function commit() {
    if (!parsed) return
    const groups = parsed.data.groups
      .map((g) => ({
        name: g.name,
        items: g.items.filter((item: MenuImportItem) => include[keyOf(g.name, item.name)]),
      }))
      .filter((g) => g.items.length > 0)
    if (groups.length === 0) { setError('INCLUDE AT LEAST ONE ITEM'); return }
    if (target === 'existing' && !menuId) { setError('PICK AN EXISTING MENU'); return }
    if (target === 'new' && !newName.trim()) { setError('NAME THE NEW MENU'); return }

    setBusy(true)
    setError('')
    const r = await fetch('/api/admin/menus/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId,
        ...(target === 'existing' ? { menuId } : { menuName: newName.trim() }),
        data: {
          name: newName.trim() || parsed.data.name,
          description: parsed.data.description,
          groups,
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
    onImported(String(out.menuId ?? menuId))
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
            onChange={(e) => { setAnswer(e.target.value); setParsed(null) }}
            rows={7}
            placeholder="PASTE THE LLM'S JSON HERE..."
            aria-label="Pasted LLM answer"
            className="w-full bg-black border border-grey-mid text-white font-mono text-xs p-2 outline-none focus:border-white"
          />
          <Button size="sm" onClick={parseAnswer} disabled={!answer.trim()}>PARSE ANSWER</Button>
        </div>

        {error && <p className="font-mono text-xs text-danger">{error}</p>}

        {parsed && (
          <div className="border border-grey-mid p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-2xs uppercase tracking-wider text-grey-light">3 · PREVIEW</span>
              <span className="font-mono text-2xs uppercase text-white">{includedCount} OF {flat.length} SELECTED</span>
            </div>

            {parsed.issues.length > 0 && (
              <div className="border border-warning/60 bg-warning/10 px-2 py-1.5 space-y-0.5">
                {parsed.issues.map((issue, i) => (
                  <p key={i} className="font-mono text-2xs uppercase text-warning">{issue}</p>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {parsed.data.groups.map((group) => (
                <div key={group.name} className="border border-grey-mid">
                  <div className="px-2 py-1 bg-grey-mid/20 border-b border-grey-mid font-mono text-2xs uppercase text-white">
                    {group.name}
                  </div>
                  <div className="divide-y divide-grey-mid">
                    {group.items.map((item) => {
                      const k = keyOf(group.name, item.name)
                      const match = matches.get(item.name)
                      return (
                        <label key={k} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!include[k]}
                            onChange={() => toggle(group.name, item.name)}
                            className="accent-white"
                          />
                          <span className="font-mono text-xs uppercase text-white flex-1 min-w-0 truncate">{item.name}</span>
                          <span className="font-mono text-xs text-grey-light shrink-0">
                            {item.price != null ? `$${item.price.toFixed(2)}` : 'NO PRICE'}
                          </span>
                          {item.dietary.length > 0 && (
                            <span className="font-mono text-2xs uppercase text-grey-light shrink-0">{item.dietary.join(', ')}</span>
                          )}
                          {match && (
                            <span className={`font-mono text-2xs uppercase border px-1 shrink-0 ${
                              match === 'NEW' ? 'text-success border-success'
                                : match === 'MATCH' ? 'text-info border-info'
                                  : 'text-warning border-warning'
                            }`}>
                              {match}
                            </span>
                          )}
                        </label>
                      )
                    })}
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
                NEW PRODUCTS HAVE NO RECIPE OR WOOCOMMERCE LINK — SET THOSE UP IN RECIPES → IMPORT PRODUCTS.
                EXISTING PRODUCTS KEEP THEIR CURRENT PRICE AND DESCRIPTION.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={commit} loading={busy} disabled={includedCount === 0}>IMPORT {includedCount} ITEM{includedCount === 1 ? '' : 'S'}</Button>
              <Button size="sm" variant="ghost" onClick={onClose}>CANCEL</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
