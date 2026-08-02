'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { MONTH_SEQUENCE } from '@/lib/budget-lines-import'

interface PreviewRow {
  label: string
  kind: 'GROUP' | 'LINE' | 'TOTAL' | 'SKIP'
  depth: number
  values: (number | null)[]
  sectionId: string | null
  include: boolean
}

interface Section { id: string; name: string; departmentId: string }

interface Props {
  isOpen: boolean
  onClose: () => void
  venueId: string
  year: number
  sections: Section[]
  onDone: (message: string) => void
}

const MAX_FILE_BYTES = 5 * 1024 * 1024

function money(n: number | null | undefined) {
  if (n === null || n === undefined) return ''
  return `$${Math.round(n).toLocaleString('en-NZ', { maximumFractionDigits: 0 })}`
}

// Browser-safe base64 (no Buffer in client bundles).
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}

export function BudgetImportModal({ isOpen, onClose, venueId, year, sections, onDone }: Props) {
  const [stage, setStage] = useState<'pick' | 'preview'>('pick')
  const [importYear, setImportYear] = useState(year)
  const [months, setMonths] = useState<string[]>([])
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setStage('pick')
      setImportYear(year)
      setMonths([])
      setRows([])
      setError('')
    }
  }, [isOpen, year])

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setError('FILE TOO LARGE (MAX 5MB)')
      return
    }
    setParsing(true)
    setError('')
    try {
      const buf = await file.arrayBuffer()
      const fileBase64 = arrayBufferToBase64(buf)
      const r = await fetch('/api/admin/budget-lines/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, year: importYear, fileBase64 }),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error ?? 'PARSE FAILED')
        return
      }
      setMonths(data.months ?? [])
      setRows((data.rows ?? []).map((row: PreviewRow) => ({ ...row })))
      setStage('preview')
    } catch {
      setError('COULD NOT READ THE FILE')
    } finally {
      setParsing(false)
    }
  }

  function updateRow(index: number, patch: Partial<PreviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function handleCommit() {
    setCommitting(true)
    setError('')
    try {
      const r = await fetch('/api/admin/budget-lines/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, year: importYear, months, rows }),
      })
      const data = await r.json()
      if (!r.ok) {
        setError(data.error ?? 'COMMIT FAILED')
        return
      }
      const parts = [`IMPORTED ${data.totalLines ?? 0} LINES`, `${data.createdPeriods ?? 0} PERIODS`]
      if ((data.skippedPeriods ?? 0) > 0) parts.push(`${data.skippedPeriods} SKIPPED (ALREADY HAS LINES)`)
      onDone(parts.join(' · '))
    } catch {
      setError('COMMIT FAILED')
    } finally {
      setCommitting(false)
    }
  }

  const includedCount = rows.filter((r) => r.include && r.kind !== 'SKIP').length

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="IMPORT P&L BUDGET FROM EXCEL" size="full">
      <div className="space-y-4">
        {stage === 'pick' ? (
          <>
            <p className="font-mono text-xs text-grey-light">
              UPLOAD A .XLSX P&amp;L BUDGET. THE WORKBOOK SHOULD HAVE A HEADER ROW OF MONTH NAMES
              (E.G. JUN, JUL, AUG...) AND LINE LABELS IN THE COLUMN BEFORE THEM. TOTAL ROWS AND
              PERCENTAGE ROWS ARE AUTO-DETECTED.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2">
                <span className="font-mono text-xs uppercase text-grey-light">YEAR (OF JUNE)</span>
                <input
                  type="number"
                  value={importYear}
                  onChange={(e) => setImportYear(Number(e.target.value))}
                  className="bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 w-24 outline-none focus:border-white"
                />
              </label>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="font-mono text-xs text-grey-light file:bg-white file:text-black file:border-none file:px-3 file:py-1.5 file:font-mono file:font-semibold file:uppercase file:cursor-pointer"
              />
              {parsing && <span className="font-mono text-xs text-grey-light loading-cursor">PARSING...</span>}
            </div>
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs text-grey-light">
                {months.length} MONTHS DETECTED ({MONTH_SEQUENCE.slice(0, months.length).join(' – ')})
                FOR YEAR {importYear} — {includedCount} OF {rows.length} ROWS WILL IMPORT.
              </p>
              <Button size="sm" variant="ghost" onClick={() => setStage('pick')}>← BACK</Button>
            </div>

            <div className="border border-grey-mid max-h-[55vh] overflow-y-auto">
              <div className="grid grid-cols-[24px_1fr_90px_160px_150px_100px] gap-2 px-2 py-1.5 border-b border-grey-mid bg-grey-dark/30">
                <span />
                <span className="font-mono text-xs uppercase text-grey-light tracking-wider">LABEL</span>
                <span className="font-mono text-xs uppercase text-grey-light tracking-wider">TYPE</span>
                <span className="font-mono text-xs uppercase text-grey-light tracking-wider">SECTION</span>
                <span className="font-mono text-xs uppercase text-grey-light tracking-wider">FIRST VALUE</span>
                <span className="font-mono text-xs uppercase text-grey-light tracking-wider text-right">MONTHS</span>
              </div>
              {rows.map((row, i) => {
                const firstValue = row.values.find((v) => v !== null) ?? null
                const monthCount = row.values.filter((v) => v !== null).length
                const included = row.include && row.kind !== 'SKIP'
                return (
                  <div
                    key={i}
                    className={`grid grid-cols-[24px_1fr_90px_160px_150px_100px] gap-2 px-2 py-1 border-b border-grey-mid/40 ${
                      !included ? 'opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={row.include}
                      onChange={(e) => updateRow(i, { include: e.target.checked })}
                      className="accent-white self-center"
                    />
                    <input
                      value={row.label}
                      onChange={(e) => updateRow(i, { label: e.target.value })}
                      className="bg-black border border-grey-mid text-white font-mono text-xs uppercase px-2 py-1 outline-none focus:border-white"
                    />
                    <select
                      value={row.kind}
                      onChange={(e) => updateRow(i, { kind: e.target.value as PreviewRow['kind'] })}
                      className="bg-black border border-grey-mid text-white font-mono text-xs px-1 py-1 outline-none focus:border-white"
                    >
                      <option value="LINE" className="text-white">LINE</option>
                      <option value="GROUP" className="text-white">GROUP</option>
                      <option value="TOTAL" className="text-white">TOTAL</option>
                      <option value="SKIP" className="text-white">SKIP</option>
                    </select>
                    <select
                      value={row.sectionId ?? ''}
                      onChange={(e) => updateRow(i, { sectionId: e.target.value || null })}
                      className="bg-black border border-grey-mid text-white font-mono text-xs px-1 py-1 outline-none focus:border-white"
                    >
                      <option value="">—</option>
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <span className="font-mono text-xs text-white self-center">
                      {months[0] ?? ''} {money(firstValue)}
                    </span>
                    <span className="font-mono text-xs text-grey-light text-right self-center">
                      {monthCount}/12
                    </span>
                  </div>
                )
              })}
            </div>

            {error && <p className="font-mono text-xs text-danger">{error}</p>}

            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleCommit} loading={committing} disabled={includedCount === 0}>
                IMPORT {includedCount} ROWS × {months.length} MONTHS
              </Button>
              <Button variant="ghost" onClick={onClose}>CANCEL</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
