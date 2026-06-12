'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { formatDateTime } from '@/lib/utils'

interface Completion {
  id: string
  scheduledDate: string
  completedAt: string
  note: string | null
  staff: { id: string; firstName: string; lastName: string }
  task: {
    title: string
    venue: { id: string; name: string }
    department: { id: string; name: string; colour: string | null } | null
  }
}

interface Venue { id: string; name: string }
interface Department { id: string; name: string; venueId: string }

export function ReportsClient({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const [completions, setCompletions] = useState<Completion[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [venues, setVenues] = useState<Venue[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [filterVenue, setFilterVenue] = useState(role === 'MANAGER' ? sessionVenueId : '')
  const [filterDept, setFilterDept] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [exporting, setExporting] = useState(false)

  async function load(p: number = 1) {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterVenue) params.set('venueId', filterVenue)
    if (filterDept) params.set('departmentId', filterDept)
    if (filterFrom) params.set('from', filterFrom)
    if (filterTo) params.set('to', filterTo)
    params.set('page', String(p))
    params.set('limit', '50')

    const r = await fetch(`/api/admin/reports?${params}`)
    const data = await r.json()
    setCompletions(data.completions)
    setTotal(data.total)
    setPages(data.pages)
    setPage(p)
    setLoading(false)
  }

  async function loadMeta() {
    const [vR, dR] = await Promise.all([
      fetch('/api/admin/venues'),
      fetch('/api/admin/departments'),
    ])
    const [vens, depts] = await Promise.all([vR.json(), dR.json()])
    setVenues(vens)
    setDepartments(depts)
  }

  useEffect(() => { loadMeta() }, [])
  useEffect(() => { load(1) }, [filterVenue, filterDept, filterFrom, filterTo])

  async function handleExport() {
    setExporting(true)
    const params = new URLSearchParams()
    if (filterVenue) params.set('venueId', filterVenue)
    if (filterDept) params.set('departmentId', filterDept)
    if (filterFrom) params.set('from', filterFrom)
    if (filterTo) params.set('to', filterTo)
    params.set('export', 'csv')

    const r = await fetch(`/api/admin/reports?${params}`)
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hospo-ops-audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))
  const deptOptions = [
    { value: '', label: 'ALL DEPARTMENTS' },
    ...departments
      .filter((d) => !filterVenue || d.venueId === filterVenue)
      .map((d) => ({ value: d.id, label: d.name })),
  ]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">REPORTS</h1>
        <Button variant="ghost" size="sm" onClick={handleExport} loading={exporting}>
          EXPORT CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        {role === 'ADMIN' && (
          <div className="w-48">
            <Select
              value={filterVenue}
              onChange={(e) => { setFilterVenue(e.target.value); setFilterDept('') }}
              options={[{ value: '', label: 'ALL VENUES' }, ...venueOptions]}
            />
          </div>
        )}
        <div className="w-52">
          <Select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            options={deptOptions}
          />
        </div>
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className="bg-grey-dark border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-none focus:border-white"
        />
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className="bg-grey-dark border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-none focus:border-white"
        />
        <button
          onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterDept(''); if (role === 'ADMIN') setFilterVenue('') }}
          className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
        >
          CLEAR
        </button>
      </div>

      <div className="font-mono text-xs text-grey-light">
        {total} RECORD{total !== 1 ? 'S' : ''} FOUND
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border border-grey-mid">
            <thead>
              <tr className="border-b border-grey-mid">
                {['DATE', 'STAFF', 'TASK', 'DEPARTMENT', 'VENUE', 'COMPLETED AT', 'NOTE'].map((h) => (
                  <th key={h} className="px-4 py-2 font-mono text-xs uppercase text-grey-light text-left whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-mid">
              {completions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-4 font-mono text-xs text-grey-light">
                    NO COMPLETIONS FOUND.
                  </td>
                </tr>
              ) : (
                completions.map((c) => (
                  <tr key={c.id} className="hover:bg-black/20 transition-colors">
                    <td className="px-4 py-2 font-mono text-xs text-white whitespace-nowrap">
                      {new Date(c.scheduledDate).toLocaleDateString('en-NZ')}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-white whitespace-nowrap">
                      {c.staff.firstName} {c.staff.lastName}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-white max-w-48 truncate">
                      {c.task.title}
                    </td>
                    <td className="px-4 py-2">
                      {c.task.department ? (
                        <div className="flex items-center gap-1">
                          {c.task.department.colour && (
                            <div className="w-2 h-2 flex-shrink-0" style={{ backgroundColor: c.task.department.colour }} />
                          )}
                          <span className="font-mono text-xs text-grey-light">{c.task.department.name}</span>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-grey-light">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-grey-light whitespace-nowrap">
                      {c.task.venue.name}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-grey-light whitespace-nowrap">
                      {formatDateTime(c.completedAt)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-grey-light max-w-48 truncate">
                      {c.note ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => load(page - 1)}
            disabled={page <= 1}
            className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors disabled:opacity-30"
          >
            ← PREV
          </button>
          <span className="font-mono text-xs text-grey-light">PAGE {page} / {pages}</span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= pages}
            className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors disabled:opacity-30"
          >
            NEXT →
          </button>
        </div>
      )}
    </div>
  )
}
