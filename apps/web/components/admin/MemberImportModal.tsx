'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { pushToast } from '@/components/ui/Toast'
import {
  applyMemberCleanAnswer,
  buildMemberCleanPrompt,
  effectiveMemberRows,
  parseMemberCleanAnswer,
  setFamilyPrimary,
  setFamilySurnames,
  setRowActive,
  setRowIncluded,
  type MemberColumnMap,
  type MemberImportPreview,
  type MemberImportRow,
} from '@/lib/member-import'
import type { CustomerGroupRow } from '@/components/admin/member-types'

interface Props {
  isOpen: boolean
  onClose: () => void
  venueId: string
  groups: CustomerGroupRow[]
  defaultGroupId?: string
  onImported: () => void
}

interface CommitResult {
  created: number
  updated: number
  total: number
  issues: { code: string; severity: string; rowId?: string; message: string }[]
}

const MAPPED_FIELDS: { key: keyof MemberColumnMap; label: string; required?: boolean }[] = [
  { key: 'membershipNumber', label: 'MEMBERSHIP NUMBER', required: true },
  { key: 'firstName', label: 'FIRST NAME', required: true },
  { key: 'lastName', label: 'LAST NAME', required: true },
  { key: 'memberType', label: 'MEMBER TYPE' },
  { key: 'email', label: 'EMAIL' },
  { key: 'phone', label: 'PHONE' },
  { key: 'status', label: 'STATUS' },
  { key: 'interests', label: 'INTERESTS' },
  { key: 'company', label: 'COMPANY' },
  { key: 'externalId', label: 'RECORD ID' },
]

export function MemberImportModal({
  isOpen,
  onClose,
  venueId,
  groups,
  defaultGroupId,
  onImported,
}: Props) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [groupId, setGroupId] = useState(defaultGroupId ?? groups[0]?.id ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<MemberImportPreview | null>(null)
  const [rows, setRows] = useState<MemberImportRow[]>([])
  const [columnMap, setColumnMap] = useState<Partial<MemberColumnMap>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<CommitResult | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiScope, setAiScope] = useState<'flagged' | 'all'>('flagged')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiAnswer, setAiAnswer] = useState('')
  const [showAllRows, setShowAllRows] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setStep('upload')
    setFile(null)
    setPreview(null)
    setRows([])
    setColumnMap({})
    setError('')
    setResult(null)
    setAiOpen(false)
    setAiAnswer('')
    setShowAllRows(false)
    setGroupId(defaultGroupId ?? groups[0]?.id ?? '')
  }, [isOpen, defaultGroupId, groups])

  const selectedGroup = groups.find((g) => g.id === groupId) ?? null
  const effective = useMemo(() => effectiveMemberRows(rows), [rows])
  const summary = useMemo(
    () => ({
      rows: rows.length,
      included: rows.filter((r) => r.include).length,
      memberships: effective.length,
      new: effective.filter((r) => r.action === 'NEW').length,
      updated: effective.filter((r) => r.action === 'UPDATE').length,
      unchanged: effective.filter((r) => r.action === 'UNCHANGED').length,
      inactive: effective.filter((r) => !r.isActive).length,
      errors: rows.reduce(
        (count, r) => count + (r.include ? r.issues.filter((i) => i.severity === 'ERROR').length : 0),
        0,
      ),
    }),
    [effective, rows],
  )
  const hasErrors = rows.some((r) => r.include && r.issues.some((i) => i.severity === 'ERROR'))
  const visibleRows = showAllRows ? rows : rows.slice(0, 500)

  async function runPreview(nextMap?: Partial<MemberColumnMap>) {
    if (!file) {
      setError('CHOOSE A CSV FILE')
      return
    }
    if (!groupId) {
      setError('CHOOSE A DATABASE')
      return
    }
    setBusy('preview')
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('venueId', venueId)
      form.append('groupId', groupId)
      if (nextMap && Object.keys(nextMap).length > 0) {
        form.append('columnMap', JSON.stringify(nextMap))
      }
      const res = await fetch('/api/admin/customer-memberships/import/preview', {
        method: 'POST',
        body: form,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'COULD NOT READ THE CSV')
        return
      }
      const parsed = body.preview as MemberImportPreview
      setPreview(parsed)
      setRows(parsed.rows)
      setColumnMap(parsed.used)
      setStep('preview')
    } catch {
      setError('COULD NOT READ THE CSV')
    } finally {
      setBusy('')
    }
  }

  function updateMapping(field: keyof MemberColumnMap, header: string) {
    setColumnMap((current) => ({ ...current, [field]: header || undefined }))
  }

  async function commit() {
    if (!preview || !groupId) return
    if (hasErrors) {
      setError('FIX THE RED ROWS OR EXCLUDE THEM BEFORE IMPORTING')
      return
    }
    if (effective.length === 0) {
      setError('NOTHING TO IMPORT')
      return
    }
    setBusy('commit')
    setError('')
    try {
      const res = await fetch('/api/admin/customer-memberships/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, groupId, rows }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'IMPORT FAILED')
        return
      }
      setResult(body as CommitResult)
      setStep('done')
      onImported()
      pushToast(`IMPORTED ${body.total ?? 0} MEMBERSHIP${body.total === 1 ? '' : 'S'}`, 'success')
    } catch {
      setError('IMPORT FAILED')
    } finally {
      setBusy('')
    }
  }

  function openAi() {
    setAiOpen(true)
    setAiPrompt(buildMemberCleanPrompt(rows, aiScope))
  }

  function changeAiScope(scope: 'flagged' | 'all') {
    setAiScope(scope)
    setAiPrompt(buildMemberCleanPrompt(rows, scope))
  }

  function applyAi() {
    const answer = parseMemberCleanAnswer(aiAnswer)
    if (answer.length === 0) {
      setError('COULD NOT READ THE CLEANED JSON')
      return
    }
    setRows((current) => applyMemberCleanAnswer(current, answer))
    setAiAnswer('')
    setError('')
    pushToast(`APPLIED ${answer.length} CLEANED ROW${answer.length === 1 ? '' : 'S'}`, 'success')
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(aiPrompt)
      pushToast('PROMPT COPIED', 'success')
    } catch {
      pushToast('COPY FAILED — SELECT THE TEXT MANUALLY', 'error')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="IMPORT MEMBERS" size="xl">
      <div className="max-h-[78vh] overflow-y-auto pr-1 space-y-4">
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Select
                label="DATABASE"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                options={groups.map((g) => ({ value: g.id, label: `${g.name} (${g.memberCount})` }))}
                placeholder="CHOOSE A DATABASE"
              />
              <div className="flex flex-col gap-1">
                <label className="label">CSV FILE</label>
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full border border-grey-mid bg-black px-2 py-1.5 font-mono text-xs text-white file:mr-3 file:border-0 file:bg-white file:px-2 file:py-1 file:font-mono file:text-xs file:uppercase file:text-black"
                />
                <p className="font-mono text-2xs uppercase text-grey-light">
                  THE FILE IS READ IN MEMORY AND DISCARDED. NOTHING IS STORED ON THE SERVER.
                </p>
              </div>
            </div>

            <div className="border border-grey-mid p-3 space-y-1">
              <p className="font-mono text-xs uppercase text-grey-light">WHAT HAPPENS NEXT</p>
              <p className="font-mono text-2xs uppercase text-grey-light">
                1. WE DETECT THE COLUMNS AND CLEAN NAMES / NUMBERS.
              </p>
              <p className="font-mono text-2xs uppercase text-grey-light">
                2. YOU REVIEW AND EDIT EVERY ROW, FAMILY AND ACTIVE FLAG.
              </p>
              <p className="font-mono text-2xs uppercase text-grey-light">
                3. ONLY THEN IS THE DATABASE UPDATED.
              </p>
              <p className="font-mono text-2xs uppercase text-grey-light">
                NO MEMBERSHIP NUMBER = ROW CANNOT BE EXPORTED TO SWIFTPOS.
              </p>
              <p className="font-mono text-2xs uppercase text-grey-light">
                ROWS THE EXPORT MARKS AS RETIRED START INACTIVE — TOGGLE ANY ROW IN THE REVIEW.
              </p>
            </div>

            {error && <p className="font-mono text-xs text-danger">{error}</p>}

            <div className="border-t border-grey-mid pt-3 flex flex-wrap items-center gap-2">
              <Button size="sm" loading={busy === 'preview'} onClick={() => void runPreview()}>
                PREVIEW IMPORT
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>CANCEL</Button>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-mono text-sm uppercase tracking-widest text-white">
                  REVIEW IMPORT — {selectedGroup?.name ?? 'DATABASE'}
                </h3>
                <p className="font-mono text-xs uppercase text-grey-light">
                  {summary.rows} ROWS · {summary.memberships} MEMBERSHIPS · {summary.inactive} INACTIVE · {summary.errors} ERRORS
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setStep('upload')}>BACK</Button>
                <Button size="sm" variant="ghost" onClick={openAi}>CLEAN WITH AI</Button>
                <Button size="sm" loading={busy === 'commit'} disabled={hasErrors || summary.memberships === 0} onClick={commit}>
                  IMPORT {summary.memberships} MEMBERSHIPS
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {[
                ['ROWS', summary.rows],
                ['NEW', summary.new],
                ['UPDATED', summary.updated],
                ['UNCHANGED', summary.unchanged],
                ['INACTIVE', summary.inactive],
                ['FAMILIES', preview.families.length],
                ['ERRORS', summary.errors],
              ].map(([label, value]) => (
                <div key={String(label)} className="border border-grey-mid p-2">
                  <div className="font-mono text-2xs uppercase text-grey-light">{label}</div>
                  <div className={`font-mono text-lg ${label === 'ERRORS' && Number(value) > 0 ? 'text-danger' : 'text-white'}`}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {preview.missing.length > 0 && (
              <div className="border border-danger/60 p-3 space-y-3">
                <p className="font-mono text-xs uppercase text-danger">
                  MAP THE MISSING COLUMNS: {preview.missing.join(', ')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {MAPPED_FIELDS.filter((field) => field.required || preview.used[field.key]).map((field) => (
                    <Select
                      key={field.key}
                      label={`${field.label}${field.required ? ' *' : ''}`}
                      value={columnMap[field.key] ?? ''}
                      onChange={(e) => updateMapping(field.key, e.target.value)}
                      options={preview.headers.map((header) => ({ value: header, label: header }))}
                      placeholder="NOT MAPPED"
                    />
                  ))}
                </div>
                <Button size="sm" variant="ghost" loading={busy === 'preview'} onClick={() => void runPreview(columnMap)}>
                  RE-READ WITH THIS MAPPING
                </Button>
              </div>
            )}

            {preview.issues.length > 0 && (
              <div className="border border-grey-mid p-3">
                <p className="font-mono text-xs uppercase text-grey-light">IMPORT NOTES</p>
                <ul className="mt-1 space-y-1">
                  {preview.issues.slice(0, 10).map((issue, index) => (
                    <li key={`${issue.code}-${index}`} className={`font-mono text-2xs uppercase ${issue.severity === 'ERROR' ? 'text-danger' : 'text-grey-light'}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.families.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">FAMILIES</h3>
                {preview.families.map((family) => {
                  const familyRows = rows.filter((r) => r.baseNumber === family.key)
                  const surnames = familyRows[0]?.familySurnames ?? family.surnames
                  return (
                    <div key={family.key} className="border border-grey-mid p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-white">#{family.membershipNumber}</span>
                        <Input
                          value={surnames}
                          onChange={(e) => setRows((current) => setFamilySurnames(current, family.key, e.target.value))}
                          placeholder="SMITH/JONES (Family)"
                          className="max-w-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        {familyRows.map((row) => (
                          <label key={row.id} className="flex items-center gap-2 font-mono text-xs uppercase text-grey-light">
                            <input
                              type="radio"
                              name={`family-${family.key}`}
                              checked={row.isPrimary}
                              onChange={() => setRows((current) => setFamilyPrimary(current, family.key, row.id))}
                            />
                            <span className="text-white">{row.firstName} {row.lastName}</span>
                            <span>ROW {row.sourceRow}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {aiOpen && (
              <div className="border border-grey-mid p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">CLEAN WITH AI</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeAiScope('flagged')}
                      className={`px-2 py-1 font-mono text-2xs uppercase border ${aiScope === 'flagged' ? 'border-white bg-white text-black' : 'border-grey-mid text-grey-light'}`}
                    >
                      FLAGGED ROWS
                    </button>
                    <button
                      onClick={() => changeAiScope('all')}
                      className={`px-2 py-1 font-mono text-2xs uppercase border ${aiScope === 'all' ? 'border-white bg-white text-black' : 'border-grey-mid text-grey-light'}`}
                    >
                      ALL ROWS
                    </button>
                  </div>
                </div>
                <p className="font-mono text-2xs uppercase text-grey-light">
                  ONLY NAME, NUMBER, TYPE, STATUS AND FAMILY FLAGS ARE IN THE PROMPT. NO EMAIL OR PHONE.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-2xs uppercase text-grey-light">PROMPT</span>
                    <Button size="sm" variant="ghost" onClick={() => void copyPrompt()}>COPY PROMPT</Button>
                  </div>
                  <textarea
                    readOnly
                    value={aiPrompt}
                    rows={8}
                    className="w-full bg-black border border-grey-mid px-2 py-1.5 font-mono text-2xs text-white outline-none focus:border-white"
                  />
                </div>
                <div className="space-y-2">
                  <span className="font-mono text-2xs uppercase text-grey-light">PASTE THE CLEANED JSON</span>
                  <textarea
                    value={aiAnswer}
                    onChange={(e) => setAiAnswer(e.target.value)}
                    rows={6}
                    className="w-full bg-black border border-grey-mid px-2 py-1.5 font-mono text-2xs text-white outline-none focus:border-white"
                  />
                  <Button size="sm" variant="ghost" onClick={applyAi} disabled={!aiAnswer.trim()}>
                    APPLY CLEANED RESULT
                  </Button>
                </div>
              </div>
            )}

            {error && <p className="font-mono text-xs text-danger">{error}</p>}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">ROWS</h3>
                {rows.length > 500 && (
                  <Button size="sm" variant="ghost" onClick={() => setShowAllRows((v) => !v)}>
                    {showAllRows ? 'SHOW FIRST 500' : `SHOW ALL ${rows.length}`}
                  </Button>
                )}
              </div>
              <div className="border border-grey-mid divide-y divide-grey-mid max-h-[360px] overflow-y-auto">
                <div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 bg-grey-dark/30 font-mono text-2xs uppercase tracking-wider text-grey-light">
                  <span className="col-span-1">INC</span>
                  <span className="col-span-1">ROW</span>
                  <span className="col-span-2">NUMBER</span>
                  <span className="col-span-4">NAME</span>
                  <span className="col-span-2">TYPE</span>
                  <span className="col-span-1">ACTIVE</span>
                  <span className="col-span-1 text-right">STATE</span>
                </div>
                {visibleRows.map((row) => (
                  <div key={row.id} className={`grid grid-cols-1 md:grid-cols-12 gap-2 px-3 py-2 ${row.include ? '' : 'opacity-50'}`}>
                    <div className="md:col-span-1">
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={() => setRows((current) => setRowIncluded(current, row.id, !row.include))}
                      />
                    </div>
                    <div className="md:col-span-1 font-mono text-2xs text-grey-light">{row.sourceRow}</div>
                    <div className="md:col-span-2 font-mono text-xs text-white">{row.membershipNumber || '—'}</div>
                    <div className="md:col-span-4 min-w-0">
                      <div className="font-mono text-xs text-white uppercase truncate">
                        {row.firstName} {row.isFamily ? row.familySurnames || row.lastName : row.lastName}
                      </div>
                      <div className="font-mono text-2xs uppercase text-grey-light truncate">
                        {row.isFamily ? 'FAMILY' : ''}
                        {row.email ? ` · ${row.email}` : ''}
                        {row.phone ? ` · ${row.phone}` : ''}
                      </div>
                      {row.issues.length > 0 && (
                        <div className={`font-mono text-2xs uppercase ${row.issues.some((i) => i.severity === 'ERROR') ? 'text-danger' : 'text-grey-light'}`}>
                          {row.issues.map((i) => i.message).join(' · ')}
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-2 font-mono text-xs uppercase text-grey-light truncate">{row.memberType || '—'}</div>
                    <div className="md:col-span-1">
                      <button
                        onClick={() => setRows((current) => setRowActive(current, row.id, !row.isActive))}
                        className={`px-2 py-0.5 font-mono text-2xs uppercase border ${row.isActive ? 'border-success/60 text-success' : 'border-danger/60 text-danger'}`}
                      >
                        {row.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </button>
                    </div>
                    <div className="md:col-span-1 text-left md:text-right font-mono text-2xs uppercase text-grey-light">
                      {row.action}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="space-y-4">
            <div className="border border-success/60 p-4 space-y-1">
              <h3 className="font-mono text-sm uppercase tracking-widest text-success">IMPORT COMPLETE</h3>
              <p className="font-mono text-xs uppercase text-grey-light">
                CREATED {result.created} · UPDATED {result.updated} · TOTAL {result.total}
              </p>
            </div>
            {result.issues.length > 0 && (
              <div className="border border-grey-mid p-3">
                <p className="font-mono text-xs uppercase text-grey-light">NOTES</p>
                <ul className="mt-1 space-y-1">
                  {result.issues.map((issue, index) => (
                    <li key={`${issue.code}-${index}`} className="font-mono text-2xs uppercase text-grey-light">
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={onClose}>CLOSE</Button>
              <Button size="sm" variant="ghost" onClick={() => setStep('upload')}>IMPORT ANOTHER</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
