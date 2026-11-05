'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  confirmedIssueSet,
  filterReleaseIssues,
  formatFixedDate,
  groupReleaseIssues,
  groupReleaseIssuesByFixed,
  releaseProgress,
  type ReleaseConfirmation,
  type ReleaseIssue,
  type ReleaseProgress,
} from '@/lib/release-updates'

interface ReleaseResponse {
  version: string
  generatedAt: string
  repo: string
  issues: ReleaseIssue[]
  confirmations: ReleaseConfirmation[]
  progress: ReleaseProgress
}

type RowState = 'saving' | 'saved'

function formatGeneratedAt(value: string): string {
  if (!value) return 'UNKNOWN'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-NZ')
}

/**
 * Settings → UPDATES (admin only). A verification worklist for the committed
 * GitHub release snapshot: tick delivered work as it is checked in production.
 * Ticks are personal and saved live, keyed to the snapshot version.
 */
export function ReleaseUpdatesClient() {
  const [data, setData] = useState<ReleaseResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showOpen, setShowOpen] = useState(false)
  const [view, setView] = useState<'AREA' | 'FIXED'>('AREA')
  const [search, setSearch] = useState('')
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set())
  const [rowState, setRowState] = useState<Record<number, RowState>>({})
  const [rowError, setRowError] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/updates')
      if (res.status === 401) {
        window.location.href = '/'
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError((body.error ?? 'COULD NOT LOAD UPDATES').toUpperCase())
        return
      }
      const body = (await res.json()) as ReleaseResponse
      setData(body)
      setConfirmed(confirmedIssueSet(body.confirmations ?? []))
    } catch {
      setError('COULD NOT LOAD UPDATES')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(
    () =>
      filterReleaseIssues(data?.issues ?? [], {
        status: showOpen ? 'OPEN' : 'CLOSED',
        search,
      }),
    [data, showOpen, search],
  )
  const groups = useMemo(() => groupReleaseIssues(visible), [visible])
  const fixedGroups = useMemo(() => groupReleaseIssuesByFixed(visible), [visible])
  const shownGroups = view === 'AREA' ? groups : fixedGroups
  const renderGroups = useMemo(
    () =>
      view === 'AREA'
        ? groups.map((group) => ({ key: group.area, label: group.area, issues: group.issues }))
        : fixedGroups.map((group) => ({
            key: group.date ?? 'undated',
            label: group.date ? `FIXED ${formatFixedDate(group.date)}` : 'NO FIX DATE',
            issues: group.issues,
          })),
    [view, groups, fixedGroups],
  )
  const progress = useMemo(
    () => releaseProgress(visible, confirmed),
    [visible, confirmed],
  )

  async function toggle(issue: ReleaseIssue) {
    if (!data) return
    const next = !confirmed.has(issue.number)
    const previous = confirmed
    const nextSet = new Set(confirmed)
    if (next) nextSet.add(issue.number)
    else nextSet.delete(issue.number)

    setConfirmed(nextSet)
    setRowState((prev) => ({ ...prev, [issue.number]: 'saving' }))
    setRowError((prev) => {
      const copy = { ...prev }
      delete copy[issue.number]
      return copy
    })

    try {
      const res = await fetch(`/api/admin/updates/${issue.number}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: data.version, confirmed: next }),
      })
      if (res.status === 401) {
        window.location.href = '/'
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'SAVE FAILED')
      }
      setRowState((prev) => ({ ...prev, [issue.number]: 'saved' }))
      window.setTimeout(() => {
        setRowState((prev) => {
          const copy = { ...prev }
          delete copy[issue.number]
          return copy
        })
      }, 1500)
    } catch (err) {
      setConfirmed(previous)
      setRowState((prev) => {
        const copy = { ...prev }
        delete copy[issue.number]
        return copy
      })
      setRowError((prev) => ({
        ...prev,
        [issue.number]: (err instanceof Error ? err.message : 'SAVE FAILED').toUpperCase(),
      }))
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest">UPDATE VERIFICATION</h1>
          <p className="font-mono text-xs text-grey-light mt-1">
            WORK THROUGH EVERY SHIPPED CHANGE IN PRODUCTION. TICKS SAVE LIVE AND ARE PERSONAL TO YOU.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={load} loading={loading}>
          START NEW RELEASE
        </Button>
      </div>

      <div className="border border-grey-mid p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase text-white">
            RELEASE {data?.version ?? '—'}
          </span>
          <span className="font-mono text-2xs uppercase text-grey-light">
            GENERATED {formatGeneratedAt(data?.generatedAt ?? '')}
          </span>
          {data?.repo && (
            <a
              href={`https://github.com/${data.repo}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-2xs uppercase text-grey-light hover:text-white underline"
            >
              {data.repo}
            </a>
          )}
          <span className="ml-auto font-mono text-xs uppercase text-white">
            {progress.confirmed}/{progress.total} VERIFIED
          </span>
        </div>
        <div className="flex-1 h-2 bg-grey-dark border border-grey-mid">
          <div className="h-full bg-success" style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={showOpen ? 'ghost' : 'primary'}
            onClick={() => setShowOpen(false)}
          >
            CLOSED
          </Button>
          <Button
            size="sm"
            variant={showOpen ? 'primary' : 'ghost'}
            onClick={() => setShowOpen(true)}
          >
            OPEN
          </Button>
          <Button
            size="sm"
            variant={view === 'AREA' ? 'primary' : 'ghost'}
            onClick={() => setView('AREA')}
          >
            VIEW: AREA
          </Button>
          <Button
            size="sm"
            variant={view === 'FIXED' ? 'primary' : 'ghost'}
            onClick={() => setView('FIXED')}
          >
            VIEW: FIXED DATE
          </Button>
          <div className="flex-1 min-w-48">
            <Input
              aria-label="Search issues"
              placeholder="SEARCH ISSUES…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {error && <p className="font-mono text-xs text-danger">{error}</p>}

      {!loading && !error && shownGroups.length === 0 && (
        <p className="font-mono text-xs uppercase text-grey-light">
          {showOpen ? 'NO OPEN ISSUES IN THIS RELEASE.' : 'NO DELIVERED ISSUES TO VERIFY IN THIS RELEASE.'}
        </p>
      )}

      {renderGroups.map((group) => (
        <div key={group.key} className="border border-grey-mid">
          <div className="px-3 py-1.5 bg-grey-dark/30 border-b border-grey-mid flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-grey-light">
              {group.label}
            </span>
            <span className="font-mono text-2xs uppercase text-grey-light">
              {group.issues.length} ISSUE{group.issues.length === 1 ? '' : 'S'}
            </span>
          </div>
          <div className="divide-y divide-grey-mid">
            {group.issues.map((issue) => {
              const done = confirmed.has(issue.number)
              const state = rowState[issue.number]
              return (
                <div key={issue.number} className="flex items-start gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Verify issue ${issue.number}`}
                    checked={done}
                    onChange={() => toggle(issue)}
                    className="mt-0.5 accent-white"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-white hover:underline"
                      >
                        #{issue.number} {issue.title}
                      </a>
                      <span
                        className={`font-mono text-2xs uppercase border px-1 ${
                          issue.state === 'OPEN'
                            ? 'border-success text-success'
                            : 'border-grey-mid text-grey-light'
                        }`}
                      >
                        {issue.state}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      {issue.closedAt && (
                        <span className="font-mono text-2xs uppercase text-grey-light">
                          FIXED {formatFixedDate(issue.closedAt)}
                        </span>
                      )}
                      {issue.labels.map((label) => (
                        <span
                          key={label}
                          className="font-mono text-2xs uppercase text-grey-light"
                        >
                          · {label}
                        </span>
                      ))}
                    </div>
                    {rowError[issue.number] && (
                      <p className="font-mono text-2xs uppercase text-danger mt-1">
                        {rowError[issue.number]}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-2xs uppercase text-grey-light whitespace-nowrap">
                    {state === 'saving' ? 'SAVING…' : state === 'saved' ? 'SAVED' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
