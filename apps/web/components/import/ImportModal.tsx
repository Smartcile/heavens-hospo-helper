'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { patchRowValues, setRowAction, setRowInclude, summariseRows, rowsToPayload } from '@/lib/import/framework'
import type { ImportExisting, ImportField, ImportParseResult, ImportRow, ImportRowAction, ImportSummary } from '@/lib/import/types'

export function ImportModal<T>({
  title,
  prompt,
  existing,
  parse,
  endpoint,
  venueId,
  fields,
  renderSummary,
  renderRowControls,
  onClose,
  onImported,
}: {
  title: string
  prompt: string
  existing: ImportExisting[]
  parse: (text: string, existing: ImportExisting[]) => ImportParseResult<T> | { error: string }
  /** POST target for the reviewed rows, e.g. `/api/admin/import/menu-items`. */
  endpoint: string
  /** Active venue for an ADMIN (a MANAGER is always locked to their own). */
  venueId?: string
  /** Scalar fields the operator can correct inline before importing. */
  fields?: ImportField<T>[]
  /** Optional row title/meta renderer. Defaults to `name` + `$price` (menu items). */
  renderSummary?: (values: T) => { title: string; meta?: string | null }
  /** Optional per-row control rendered beside the action select. */
  renderRowControls?: (row: ImportRow<T>, patch: (next: Partial<T>) => void) => ReactNode
  onClose: () => void
  onImported: () => void
}) {
  const [step, setStep] = useState<'PROMPT' | 'PASTE' | 'PREVIEW'>('PROMPT')
  const [answer, setAnswer] = useState('')
  const [rows, setRows] = useState<ImportRow<T>[]>([])
  const [issues, setIssues] = useState<ImportParseResult<T>['issues']>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState<Set<string>>(new Set())

  const counts = useMemo(() => summariseRows(rows), [rows])

  function toggleEditing(id: string) {
    setEditing((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function summaryFor(values: T): { title: string; meta?: string | null } {
    const custom = renderSummary?.(values)
    if (custom) return custom
    // Menu-item default (kept identical to the original hardcoded row).
    const v = values as unknown as { name?: string; price?: number | null }
    return { title: v.name ?? '', meta: v.price != null ? `$${v.price.toFixed(2)}` : 'NO PRICE' }
  }

  function copyPrompt() {
    void navigator.clipboard?.writeText(prompt).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 1500) },
      () => setError('COULD NOT COPY - SELECT THE TEXT MANUALLY'),
    )
  }

  function downloadPrompt() {
    const blob = new Blob([prompt], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'import-prompt.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function loadFile(file: File) {
    setAnswer(await file.text())
  }

  function preview() {
    setError('')
    const result = parse(answer, existing)
    if ('error' in result) { setError(result.error); return }
    setRows(result.rows)
    setIssues(result.issues)
    setStep('PREVIEW')
  }

  async function importRows() {
    setBusy(true); setError('')
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, rows: rowsToPayload(rows) }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setError(data.error ?? 'IMPORT FAILED'); return }
      setSummary(data as ImportSummary)
      onImported()
    } catch {
      setError('COULD NOT CONNECT - TRY AGAIN')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        {step === 'PROMPT' && (
          <>
            <p className="font-mono text-xs uppercase text-grey-light">
              COPY THIS PROMPT INTO YOUR LLM WITH THE DOCUMENT ATTACHED, THEN PASTE THE JSON ANSWER BACK.
            </p>
            <textarea
              readOnly
              value={prompt}
              rows={12}
              className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-none resize-y"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={copyPrompt}>{copied ? 'COPIED' : 'COPY PROMPT'}</Button>
              <Button size="sm" variant="ghost" onClick={downloadPrompt}>DOWNLOAD .MD</Button>
              <Button size="sm" variant="ghost" onClick={() => setStep('PASTE')}>NEXT</Button>
            </div>
          </>
        )}

        {step === 'PASTE' && (
          <>
            <p className="font-mono text-xs uppercase text-grey-light">
              PASTE THE LLM ANSWER (JSON, FENCED JSON OR A MARKDOWN FILE).
            </p>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={12}
              placeholder="PASTE THE JSON ANSWER HERE..."
              className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-none focus:border-white resize-y placeholder:text-grey-light"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <label className="font-mono text-xs uppercase border border-grey-mid px-3 py-1.5 text-grey-light hover:border-white hover:text-white cursor-pointer transition-colors">
                LOAD FILE
                <input
                  type="file"
                  accept=".md,.markdown,.txt,.json,application/json"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f) }}
                />
              </label>
              <Button size="sm" onClick={preview} disabled={!answer.trim()}>PREVIEW</Button>
              <Button size="sm" variant="ghost" onClick={() => setStep('PROMPT')}>BACK</Button>
            </div>
          </>
        )}

        {step === 'PREVIEW' && (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-mono text-xs uppercase text-grey-light">
                REVIEW EVERY ROW. MATCHED ROWS DEFAULT TO SKIP; NOTHING IS OVERWRITTEN WITHOUT YOUR CHOICE.
              </p>
              <span className="font-mono text-xs text-white">
                {counts.created} CREATE · {counts.updated} UPDATE · {counts.revived} REVIVE · {counts.skipped} SKIP
              </span>
            </div>

            <div className="border border-grey-mid max-h-[50vh] overflow-y-auto divide-y divide-grey-mid">
              {rows.map((row) => {
                const summary = summaryFor(row.values)
                return (
                  <div key={row.id} className="p-2 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(e) => setRows((prev) => setRowInclude(prev, row.id, e.target.checked))}
                        className="accent-white"
                      />
                      <span className="font-mono text-xs uppercase text-white">{summary.title}</span>
                      {summary.meta && <span className="font-mono text-xs text-grey-light">{summary.meta}</span>}
                      {row.match && (
                        <span className={`font-mono text-xs uppercase border px-1.5 py-0.5 ${
                          row.match.status === 'NEW'
                            ? 'text-success border-success/50'
                            : row.match.status === 'SIMILAR' || row.match.status === 'DUPLICATE_IN_FILE'
                              ? 'text-warning border-warning/50'
                              : 'text-grey-light border-grey-mid'
                        }`}>
                          {row.match.status}{row.match.label ? `: ${row.match.label}` : ''}
                        </span>
                      )}
                      {renderRowControls?.(row, (next) => setRows((prev) => patchRowValues(prev, row.id, next)))}
                      {fields && fields.length > 0 && (
                        <button
                          type="button"
                          aria-label={`${editing.has(row.id) ? 'CLOSE EDIT' : 'EDIT'} ${summary.title}`}
                          onClick={() => toggleEditing(row.id)}
                          className="font-mono text-xs uppercase text-warning hover:text-white transition-colors px-1 py-0.5"
                        >
                          {editing.has(row.id) ? 'DONE' : 'EDIT'}
                        </button>
                      )}
                      <select
                        value={row.action}
                        onChange={(e) => setRows((prev) => setRowAction(prev, row.id, e.target.value as ImportRowAction))}
                        className="ml-auto bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white"
                      >
                        <option value="CREATE">CREATE</option>
                        <option value="UPDATE">UPDATE</option>
                        <option value="REVIVE">REVIVE</option>
                        <option value="SKIP">SKIP</option>
                      </select>
                    </div>
                    {fields && fields.length > 0 && editing.has(row.id) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-5 pt-1">
                        {fields.map((field) => {
                          const raw = row.values[field.key]
                          const isNumber = field.kind === 'number'
                          const change = (next: string) => {
                            const value = isNumber
                              ? (next === '' ? null : Number(next))
                              : next
                            setRows((prev) => patchRowValues(prev, row.id, { [field.key]: value } as Partial<T>))
                          }
                          return (
                            <label key={field.key} className={field.kind === 'textarea' ? 'block sm:col-span-2' : 'block'}>
                              <span className="block font-mono text-xs uppercase text-grey-light mb-0.5">{field.label}</span>
                              {field.kind === 'textarea' ? (
                                <textarea
                                  aria-label={`${field.label} FOR ${summary.title}`}
                                  placeholder={field.placeholder}
                                  rows={2}
                                  value={raw == null ? '' : String(raw)}
                                  onChange={(e) => change(e.target.value)}
                                  className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white placeholder:text-grey-light"
                                />
                              ) : (
                                <input
                                  type={isNumber ? 'number' : 'text'}
                                  step={isNumber ? 'any' : undefined}
                                  aria-label={`${field.label} FOR ${summary.title}`}
                                  placeholder={field.placeholder}
                                  value={raw == null ? '' : String(raw)}
                                  onChange={(e) => change(e.target.value)}
                                  className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1 outline-none focus:border-white placeholder:text-grey-light"
                                />
                              )}
                            </label>
                          )
                        })}
                      </div>
                    )}
                    {row.issues.map((issue, i) => (
                      <p key={i} className={`font-mono text-xs uppercase pl-5 ${issue.severity === 'ERROR' ? 'text-danger' : 'text-warning'}`}>
                        {issue.message}
                      </p>
                    ))}
                  </div>
                )
              })}
            </div>

            {issues.length > 0 && (
              <p className="font-mono text-xs uppercase text-warning">
                {issues.length} PARSER NOTE{issues.length === 1 ? '' : 'S'} - CHECK THE FLAGGED ROWS.
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={importRows} disabled={busy || counts.created + counts.updated + counts.revived === 0}>
                {busy ? 'IMPORTING...' : 'IMPORT SELECTED'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setStep('PASTE')}>BACK</Button>
            </div>
          </>
        )}

        {summary && (
          <div className="border border-success/50 p-3 space-y-1">
            <p className="font-mono text-xs uppercase text-success">IMPORT COMPLETE</p>
            <p className="font-mono text-xs text-grey-light">
              {summary.created} CREATED · {summary.updated} UPDATED · {summary.revived} REVIVED · {summary.skipped} SKIPPED
            </p>
            {summary.warnings.map((warning, i) => (
              <p key={i} className="font-mono text-xs uppercase text-warning">{warning}</p>
            ))}
          </div>
        )}

        {error && <p className="font-mono text-xs text-danger">{error}</p>}
        <div className="border-t border-grey-mid pt-3">
          <Button size="sm" variant="ghost" onClick={onClose}>CLOSE</Button>
        </div>
      </div>
    </Modal>
  )
}
