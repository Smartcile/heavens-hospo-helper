'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { setRowAction, setRowInclude, summariseRows, rowsToPayload } from '@/lib/import/framework'
import type { ImportExisting, ImportParseResult, ImportRow, ImportRowAction, ImportSummary } from '@/lib/import/types'
import type { MenuItemImportValues } from '@/lib/import/menu-item'

export function ImportModal({
  title,
  prompt,
  existing,
  parse,
  onClose,
  onImported,
}: {
  title: string
  prompt: string
  existing: ImportExisting[]
  parse: (text: string, existing: ImportExisting[]) => ImportParseResult<MenuItemImportValues> | { error: string }
  onClose: () => void
  onImported: () => void
}) {
  const [step, setStep] = useState<'PROMPT' | 'PASTE' | 'PREVIEW'>('PROMPT')
  const [answer, setAnswer] = useState('')
  const [rows, setRows] = useState<ImportRow<MenuItemImportValues>[]>([])
  const [issues, setIssues] = useState<ImportParseResult<MenuItemImportValues>['issues']>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [copied, setCopied] = useState(false)

  const counts = useMemo(() => summariseRows(rows), [rows])

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
      const r = await fetch('/api/admin/import/menu-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToPayload(rows) }),
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
              {rows.map((row) => (
                <div key={row.id} className="p-2 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={(e) => setRows((prev) => setRowInclude(prev, row.id, e.target.checked))}
                      className="accent-white"
                    />
                    <span className="font-mono text-xs uppercase text-white">{row.values.name}</span>
                    <span className="font-mono text-xs text-grey-light">
                      {row.values.price != null ? `$${row.values.price.toFixed(2)}` : 'NO PRICE'}
                    </span>
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
                  {row.issues.map((issue, i) => (
                    <p key={i} className={`font-mono text-xs uppercase pl-5 ${issue.severity === 'ERROR' ? 'text-danger' : 'text-warning'}`}>
                      {issue.message}
                    </p>
                  ))}
                </div>
              ))}
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
