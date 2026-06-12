'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Badge } from '@/components/ui/Badge'
import { formatDateTime, formatDate } from '@/lib/utils'
import type { DashboardStats } from '@hospo-ops/types'

interface MissedItem {
  taskId: string
  taskTitle: string
  departmentName: string | null
  departmentColour: string | null
  venueName: string
  date: string
}

interface OverdueData {
  days: number
  totalMissed: number
  items: MissedItem[]
}

export function DashboardClient({ role }: { role: string }) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [overdue, setOverdue] = useState<OverdueData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/dashboard').then((r) => r.json()),
      fetch('/api/admin/overdue?days=7').then((r) => r.json()),
    ])
      .then(([statsData, overdueData]) => {
        setStats(statsData)
        setOverdue(overdueData)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest loading-cursor">
          LOADING
        </h1>
      </div>
    )
  }

  if (!stats) return null

  const overallPercent = stats.completionPercent

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">
            DASHBOARD
          </h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">
            TODAY&apos;S OVERVIEW
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/tasks" className="btn-ghost text-xs px-3 py-1.5 font-mono uppercase border border-grey-mid text-white hover:border-white transition-colors">
            + TASK
          </Link>
          <Link href="/admin/staff" className="btn-ghost text-xs px-3 py-1.5 font-mono uppercase border border-grey-mid text-white hover:border-white transition-colors">
            + STAFF
          </Link>
          <Link href="/admin/qrcodes" className="btn-ghost text-xs px-3 py-1.5 font-mono uppercase border border-grey-mid text-white hover:border-white transition-colors">
            + QR CODE
          </Link>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 bg-grey-dark border border-grey-mid">
          <div className="label text-grey-light font-mono text-xs uppercase tracking-wider mb-1">TOTAL TASKS</div>
          <div className="font-mono text-3xl font-bold text-white">{stats.totalTasksToday}</div>
        </div>
        <div className="card p-4 bg-grey-dark border border-grey-mid">
          <div className="label text-grey-light font-mono text-xs uppercase tracking-wider mb-1">COMPLETED</div>
          <div className="font-mono text-3xl font-bold text-success">{stats.completedTasksToday}</div>
        </div>
        <div className="card p-4 bg-grey-dark border border-grey-mid">
          <div className="label text-grey-light font-mono text-xs uppercase tracking-wider mb-1">PENDING</div>
          <div className="font-mono text-3xl font-bold text-warning">{stats.overdueCount}</div>
        </div>
        <div className="card p-4 bg-grey-dark border border-grey-mid">
          <div className="label text-grey-light font-mono text-xs uppercase tracking-wider mb-1">COMPLETION</div>
          <div className="font-mono text-3xl font-bold" style={{ color: overallPercent >= 75 ? '#4ADE80' : overallPercent >= 40 ? '#FACC15' : '#F87171' }}>
            {overallPercent}%
          </div>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="card p-4 bg-grey-dark border border-grey-mid">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-xs uppercase tracking-wider text-grey-light">OVERALL PROGRESS</span>
          <span className="font-mono text-xs text-white">{stats.completedTasksToday} / {stats.totalTasksToday}</span>
        </div>
        <ProgressBar value={stats.completedTasksToday} max={stats.totalTasksToday} />
      </div>

      {/* Venue/Department breakdown */}
      <div className="space-y-4">
        <h2 className="font-mono text-sm uppercase tracking-widest text-grey-light">BY VENUE</h2>
        {stats.venueStats.map((venue) => (
          <div key={venue.venueId} className="card bg-grey-dark border border-grey-mid">
            <div className="p-4 border-b border-grey-mid flex items-center justify-between">
              <div>
                <span className="font-mono text-sm font-semibold uppercase text-white">{venue.venueName}</span>
                <span className="font-mono text-xs text-grey-light ml-2">
                  {venue.completedTasks}/{venue.totalTasks}
                </span>
              </div>
              <Badge variant={venue.completionPercent >= 75 ? 'success' : venue.completionPercent >= 40 ? 'warning' : 'danger'}>
                {venue.completionPercent}%
              </Badge>
            </div>
            <div className="p-4 space-y-3">
              {venue.departmentStats.map((dept) => (
                <div key={dept.departmentId}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {dept.colour && (
                        <div className="w-2 h-2 flex-shrink-0" style={{ backgroundColor: dept.colour }} />
                      )}
                      <span className="font-mono text-xs uppercase text-white">{dept.departmentName}</span>
                    </div>
                    <span className="font-mono text-xs text-grey-light">
                      {dept.completedTasks}/{dept.totalTasks}
                    </span>
                  </div>
                  <ProgressBar value={dept.completedTasks} max={dept.totalTasks} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="space-y-2">
        <h2 className="font-mono text-sm uppercase tracking-widest text-grey-light">RECENT ACTIVITY</h2>
        <div className="card bg-grey-dark border border-grey-mid overflow-hidden">
          {stats.recentActivity.length === 0 ? (
            <p className="p-4 font-mono text-xs text-grey-light">NO ACTIVITY YET TODAY</p>
          ) : (
            <div className="divide-y divide-grey-mid">
              {stats.recentActivity.map((a) => (
                <div key={a.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-1.5 h-1.5 bg-success flex-shrink-0" />
                    <span className="font-mono text-xs text-white truncate">{a.staffName}</span>
                    <span className="font-mono text-xs text-grey-light truncate">{a.taskTitle}</span>
                    {a.departmentName && (
                      <span className="font-mono text-xs text-grey-light hidden md:block">[{a.departmentName}]</span>
                    )}
                  </div>
                  <span className="font-mono text-xs text-grey-light flex-shrink-0 ml-2">
                    {formatDateTime(a.completedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Missed tasks (last 7 days) */}
      {overdue && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm uppercase tracking-widest text-grey-light">
              MISSED — LAST {overdue.days} DAYS
            </h2>
            {overdue.totalMissed > 0 && (
              <Badge variant="danger">{overdue.totalMissed}</Badge>
            )}
          </div>
          <div className="card bg-grey-dark border border-grey-mid overflow-hidden">
            {overdue.totalMissed === 0 ? (
              <div className="status-bar-success p-4">
                <p className="font-mono text-xs text-success">
                  NO MISSED TASKS IN THE LAST {overdue.days} DAYS — GREAT WORK
                </p>
              </div>
            ) : (
              <div className="divide-y divide-grey-mid">
                {overdue.items.map((m, i) => (
                  <div key={`${m.taskId}-${i}`} className="px-4 py-2.5 flex items-center justify-between status-bar-danger">
                    <div className="flex items-center gap-3 min-w-0">
                      {m.departmentColour && (
                        <span className="w-1.5 h-1.5 flex-shrink-0" style={{ backgroundColor: m.departmentColour }} />
                      )}
                      <span className="font-mono text-xs text-white truncate">{m.taskTitle}</span>
                      {m.departmentName && (
                        <span className="font-mono text-xs text-grey-light truncate hidden md:block">[{m.departmentName}]</span>
                      )}
                    </div>
                    <span className="font-mono text-xs text-danger flex-shrink-0 ml-2">
                      {formatDate(m.date)}
                    </span>
                  </div>
                ))}
                {overdue.totalMissed > overdue.items.length && (
                  <div className="px-4 py-2 font-mono text-xs text-grey-light">
                    + {overdue.totalMissed - overdue.items.length} MORE
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
