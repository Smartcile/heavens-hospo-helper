'use client'

// Customisable admin dashboard: each block is a widget that can be dragged to
// reorder and hidden/shown in CUSTOMIZE mode. The layout is saved per staff
// member (`Staff.dashboardLayout`) via /api/admin/dashboard/layout.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Badge } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Panel'
import { formatDateTime, formatDate } from '@/lib/utils'
import {
  DASHBOARD_WIDGETS,
  moveWidget,
  parseDashboardLayout,
  visibleWidgets,
  type DashboardLayout,
} from '@/lib/dashboard-widgets'
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

interface WidgetExtra {
  date: string
  bookings: {
    count: number
    next: { id: string; startTime: string; partySize: number; contactName: string; status: string }[]
  }
  orders: {
    count: number
    total: number
    next: { id: string; orderNumber: string | null; serviceTime: string | null; totalAmount: number | null; opStatus: string; customerName: string | null }[]
  }
  events: { id: string; name: string; eventDate: string; guestCount: number; status: string }[]
  hsAlertsOpen: number
  clockedIn: number
  training: { summary: { green: number; yellow: number; red: number }; onShiftActionNeeded: number } | null
}

export function DashboardClient({ role }: { role: string }) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [overdue, setOverdue] = useState<OverdueData | null>(null)
  const [extra, setExtra] = useState<WidgetExtra | null>(null)
  const [layout, setLayout] = useState<DashboardLayout>(() => parseDashboardLayout(null))
  const [loading, setLoading] = useState(true)
  const [customizing, setCustomizing] = useState(false)
  const dragId = useRef<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/dashboard').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/admin/overdue?days=7').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/admin/dashboard/widgets').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/admin/dashboard/layout').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([statsData, overdueData, extraData, layoutData]) => {
        if (statsData) setStats(statsData)
        if (overdueData) setOverdue(overdueData)
        if (extraData) setExtra(extraData)
        if (layoutData) setLayout(parseDashboardLayout(layoutData))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function saveLayout(next: DashboardLayout) {
    setLayout(next)
    await fetch('/api/admin/dashboard/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => { /* layout change is best-effort */ })
  }

  function toggleHidden(id: string) {
    const hidden = layout.hidden.includes(id)
      ? layout.hidden.filter((h) => h !== id)
      : [...layout.hidden, id]
    saveLayout({ ...layout, hidden })
  }

  function resetLayout() {
    saveLayout(parseDashboardLayout(null))
  }

  function onDropWidget(targetId: string) {
    const id = dragId.current
    dragId.current = null
    if (!id || id === targetId) return
    const targetIndex = layout.order.indexOf(targetId)
    if (targetIndex === -1) return
    saveLayout({ ...layout, order: moveWidget(layout.order, id, targetIndex) })
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest loading-cursor">LOADING</h1>
      </div>
    )
  }

  if (!stats) return null

  const overallPercent = stats.completionPercent
  const widgets = visibleWidgets(layout)

  const widgetBody = (id: string) => {
    switch (id) {
      case 'SUMMARY':
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Panel padding="lg">
              <div className="label mb-1">TOTAL TASKS</div>
              <div className="font-mono text-3xl font-bold text-white">{stats.totalTasksToday}</div>
            </Panel>
            <Panel padding="lg">
              <div className="label mb-1">COMPLETED</div>
              <div className="font-mono text-3xl font-bold text-success">{stats.completedTasksToday}</div>
            </Panel>
            <Panel padding="lg">
              <div className="label mb-1">PENDING</div>
              <div className="font-mono text-3xl font-bold text-warning">{stats.overdueCount}</div>
            </Panel>
            <Panel padding="lg">
              <div className="label mb-1">COMPLETION</div>
              <div
                className={`font-mono text-3xl font-bold ${overallPercent >= 75 ? 'text-success' : overallPercent >= 40 ? 'text-warning' : 'text-danger'}`}
              >
                {overallPercent}%
              </div>
            </Panel>
          </div>
        )

      case 'ATTENTION': {
        if (!overdue) return null
        const missed = overdue.totalMissed
        const pending = stats.overdueCount
        if (missed === 0 && pending === 0) {
          return (
            <Panel padding="lg" className="status-bar-success h-full">
              <p className="font-mono text-sm text-success uppercase tracking-wider">ALL CLEAR — EVERYTHING ON TRACK</p>
              <p className="font-mono text-xs text-grey-light mt-1">
                NO MISSED TASKS IN THE LAST {overdue.days} DAYS AND NOTHING OUTSTANDING TODAY.
              </p>
            </Panel>
          )
        }
        return (
          <Panel padding="lg" className={`${missed > 0 ? 'status-bar-danger' : 'status-bar-warning'} h-full`}>
            <p className={`font-mono text-sm uppercase tracking-wider ${missed > 0 ? 'text-danger' : 'text-warning'}`}>
              ATTENTION NEEDED
            </p>
            <p className="font-mono text-xs text-white mt-1">
              {missed > 0 && <span className="text-danger">{missed} MISSED IN LAST {overdue.days} DAYS</span>}
              {missed > 0 && pending > 0 && <span className="text-grey-light"> · </span>}
              {pending > 0 && <span className="text-warning">{pending} STILL PENDING TODAY</span>}
            </p>
          </Panel>
        )
      }

      case 'PROGRESS':
        return (
          <Panel padding="lg" className="h-full">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs uppercase tracking-wider text-grey-light">OVERALL PROGRESS</span>
              <span className="font-mono text-xs text-white">{stats.completedTasksToday} / {stats.totalTasksToday}</span>
            </div>
            <ProgressBar value={stats.completedTasksToday} max={stats.totalTasksToday} />
          </Panel>
        )

      case 'BOOKINGS':
        return (
          <Link href="/admin/ops?tab=bookings" className="block h-full">
            <Panel padding="lg" className="h-full hover:border-white transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs uppercase tracking-wider text-grey-light">TODAY&apos;S BOOKINGS</span>
                <span className="font-mono text-lg text-white font-bold">{extra?.bookings.count ?? 0}</span>
              </div>
              {(extra?.bookings.next ?? []).length === 0 ? (
                <p className="font-mono text-xs text-grey-light">NOTHING BOOKED TODAY.</p>
              ) : (
                <div className="space-y-1">
                  {extra!.bookings.next.map((b) => (
                    <div key={b.id} className="flex items-center justify-between font-mono text-xs">
                      <span className="text-grey-light">{b.startTime} · {b.contactName}</span>
                      <span className="text-white">{b.partySize} PAX</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </Link>
        )

      case 'ORDERS':
        return (
          <Link href="/admin/orders" className="block h-full">
            <Panel padding="lg" className="h-full hover:border-white transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs uppercase tracking-wider text-grey-light">TODAY&apos;S ORDERS</span>
                <span className="font-mono text-lg text-white font-bold">{extra?.orders.count ?? 0}</span>
              </div>
              {(extra?.orders.next ?? []).length === 0 ? (
                <p className="font-mono text-xs text-grey-light">NO ORDERS FOR TODAY.</p>
              ) : (
                <div className="space-y-1">
                  {extra!.orders.next.map((o) => (
                    <div key={o.id} className="flex items-center justify-between font-mono text-xs">
                      <span className="text-grey-light">{o.serviceTime ?? '—'} · {o.customerName ?? o.orderNumber ?? 'ORDER'}</span>
                      <span className="text-white">{o.totalAmount != null ? `$${o.totalAmount.toFixed(2)}` : o.opStatus}</span>
                    </div>
                  ))}
                </div>
              )}
              {(extra?.orders.total ?? 0) > 0 && (
                <p className="mt-2 font-mono text-xs text-gold">${extra!.orders.total.toFixed(2)} TOTAL</p>
              )}
            </Panel>
          </Link>
        )

      case 'EVENTS':
        return (
          <Link href="/admin/events" className="block h-full">
            <Panel padding="lg" className="h-full hover:border-white transition-colors">
              <span className="font-mono text-xs uppercase tracking-wider text-grey-light">UPCOMING EVENTS</span>
              {(extra?.events ?? []).length === 0 ? (
                <p className="font-mono text-xs text-grey-light mt-2">NO UPCOMING EVENTS.</p>
              ) : (
                <div className="space-y-1 mt-2">
                  {extra!.events.map((e) => (
                    <div key={e.id} className="flex items-center justify-between font-mono text-xs">
                      <span className="text-white truncate">{e.name}</span>
                      <span className="text-grey-light shrink-0 ml-2">{e.eventDate} · {e.guestCount} PAX</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </Link>
        )

      case 'TRAINING':
        return (
          <Link href="/admin/training?tab=status" className="block h-full">
            <Panel padding="lg" className="h-full hover:border-white transition-colors">
              <span className="font-mono text-xs uppercase tracking-wider text-grey-light">TRAINING STATUS</span>
              {!extra?.training ? (
                <p className="font-mono text-xs text-grey-light mt-2">NOT AVAILABLE.</p>
              ) : (
                <>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="font-mono text-xs uppercase border border-success px-1.5 py-0.5 text-success">{extra.training.summary.green} ON TRACK</span>
                    <span className="font-mono text-xs uppercase border border-warning px-1.5 py-0.5 text-warning">{extra.training.summary.yellow} TO WORK ON</span>
                    <span className="font-mono text-xs uppercase border border-danger px-1.5 py-0.5 text-danger">{extra.training.summary.red} ACTION</span>
                  </div>
                  <p className="font-mono text-xs text-grey-light mt-2">
                    {extra.training.onShiftActionNeeded > 0
                      ? `${extra.training.onShiftActionNeeded} ON SHIFT TODAY NEED FOLLOW-UP.`
                      : 'NOBODY ON SHIFT TODAY NEEDS FOLLOW-UP.'}
                  </p>
                </>
              )}
            </Panel>
          </Link>
        )

      case 'STOCK':
        return (
          <Panel padding="lg" className={`h-full ${stats.parAlerts && stats.parAlerts.length > 0 ? 'border-danger/50' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs uppercase tracking-wider text-grey-light">PAR / STOCK ALERTS</span>
              {stats.parAlerts && stats.parAlerts.length > 0 && (
                <span className="font-mono text-xs text-danger">{stats.parAlerts.length} BELOW PAR</span>
              )}
            </div>
            {!stats.parAlerts || stats.parAlerts.length === 0 ? (
              <p className="font-mono text-xs text-success">ALL STOCK AT OR ABOVE PAR.</p>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {stats.parAlerts.slice(0, 10).map((a, i) => (
                  <div key={i} className="flex items-center justify-between font-mono text-xs text-grey-light">
                    <span>{a.itemName} <span className="text-grey-mid">({a.categoryName})</span></span>
                    <span className="text-danger">{a.currentQty} / {a.parLevel}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )

      case 'FOOD_SAFETY':
        return (
          <Link href="/admin/compliance?tab=alerts" className="block h-full">
            <Panel padding="lg" className={`h-full hover:border-white transition-colors ${(extra?.hsAlertsOpen ?? 0) > 0 ? 'border-danger/50' : ''}`}>
              <span className="font-mono text-xs uppercase tracking-wider text-grey-light">FOOD SAFETY ALERTS</span>
              <div className={`font-mono text-3xl font-bold mt-2 ${(extra?.hsAlertsOpen ?? 0) > 0 ? 'text-danger' : 'text-success'}`}>
                {extra?.hsAlertsOpen ?? 0}
              </div>
              <p className="font-mono text-xs text-grey-light mt-1">
                {(extra?.hsAlertsOpen ?? 0) > 0 ? 'OPEN — REVIEW THE ALERTS TAB.' : 'NO OPEN ALERTS.'}
              </p>
            </Panel>
          </Link>
        )

      case 'LIVE_FLOOR':
        return (
          <Link href="/admin/team?tab=clocks" className="block h-full">
            <Panel padding="lg" className="h-full hover:border-white transition-colors">
              <span className="font-mono text-xs uppercase tracking-wider text-grey-light">LIVE FLOOR</span>
              <div className="font-mono text-3xl font-bold text-white mt-2">{extra?.clockedIn ?? 0}</div>
              <p className="font-mono text-xs text-grey-light mt-1">CLOCKED IN RIGHT NOW.</p>
            </Panel>
          </Link>
        )

      case 'MISSED':
        return (
          <Panel padding="none" className="overflow-hidden h-full">
            <div className="px-4 pt-3 flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wider text-grey-light">
                MISSED — LAST {overdue?.days ?? 7} DAYS
              </span>
              {(overdue?.totalMissed ?? 0) > 0 && <Badge variant="danger">{overdue!.totalMissed}</Badge>}
            </div>
            {!overdue || overdue.totalMissed === 0 ? (
              <div className="status-bar-success p-4 mt-2">
                <p className="font-mono text-xs text-success">NO MISSED TASKS — GREAT WORK</p>
              </div>
            ) : (
              <div className="divide-y divide-grey-mid mt-2 max-h-64 overflow-y-auto">
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
                    <span className="font-mono text-xs text-danger flex-shrink-0 ml-2">{formatDate(m.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )

      case 'RECENT':
        return (
          <Panel padding="none" className="overflow-hidden h-full">
            <div className="px-4 pt-3">
              <span className="font-mono text-xs uppercase tracking-wider text-grey-light">RECENT ACTIVITY</span>
            </div>
            {stats.recentActivity.length === 0 ? (
              <p className="p-4 font-mono text-xs text-grey-light">NO ACTIVITY YET TODAY</p>
            ) : (
              <div className="divide-y divide-grey-mid mt-2 max-h-64 overflow-y-auto">
                {stats.recentActivity.map((a) => (
                  <div key={a.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-1.5 h-1.5 bg-success flex-shrink-0" />
                      <span className="font-mono text-xs text-white truncate">{a.staffName}</span>
                      <span className="font-mono text-xs text-grey-light truncate">{a.taskTitle}</span>
                    </div>
                    <span className="font-mono text-xs text-grey-light flex-shrink-0 ml-2">{formatDateTime(a.completedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )

      case 'BY_DEPARTMENT':
        return (
          <div className="space-y-4">
            {stats.venueStats.map((venue) => (
              <Panel key={venue.venueId} padding="none">
                <div className="p-4 border-b border-grey-mid flex items-center justify-between">
                  <div>
                    <span className="font-mono text-sm font-semibold uppercase text-white">{venue.venueName}</span>
                    <span className="font-mono text-xs text-grey-light ml-2">{venue.completedTasks}/{venue.totalTasks}</span>
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
                          {dept.colour && <div className="w-2 h-2 flex-shrink-0" style={{ backgroundColor: dept.colour }} />}
                          <span className="font-mono text-xs uppercase text-white">{dept.departmentName}</span>
                        </div>
                        <span className="font-mono text-xs text-grey-light">{dept.completedTasks}/{dept.totalTasks}</span>
                      </div>
                      <ProgressBar value={dept.completedTasks} max={dept.totalTasks} />
                    </div>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white">DASHBOARD</h1>
          <p className="font-mono text-xs text-grey-light mt-1 uppercase">
            TODAY&apos;S OVERVIEW — DRAG BLOCKS TO REORDER
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCustomizing((c) => !c)}
            className={`btn btn-sm ${customizing ? 'btn-primary' : 'btn-ghost'}`}
          >
            {customizing ? '✓ DONE' : 'CUSTOMIZE'}
          </button>
          {customizing && (
            <button onClick={resetLayout} className="btn btn-sm btn-ghost">
              ↻ RESET
            </button>
          )}
          <Link href="/admin/execution?tab=tasks" className="btn btn-sm btn-ghost">+ TASK</Link>
          <Link href="/admin/team?tab=staff" className="btn btn-sm btn-ghost">+ STAFF</Link>
          <Link href="/admin/settings?tab=qrcodes" className="btn btn-sm btn-ghost">+ QR CODE</Link>
        </div>
      </div>

      {customizing && (
        <Panel padding="lg">
          <p className="font-mono text-xs uppercase text-grey-light tracking-wider mb-3">
            BLOCKS — UNTICK TO HIDE · DRAG THE ⠿ HANDLE TO REORDER
          </p>
          <div className="flex flex-wrap gap-2">
            {DASHBOARD_WIDGETS.map((w) => {
              const hidden = layout.hidden.includes(w.id)
              return (
                <button
                  key={w.id}
                  onClick={() => toggleHidden(w.id)}
                  className={`font-mono text-xs uppercase border px-2 py-1 transition-colors ${
                    hidden ? 'border-grey-mid text-grey-light hover:border-white' : 'border-success text-success'
                  }`}
                >
                  {hidden ? '○' : '●'} {w.label}
                </button>
              )
            })}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {widgets.map((w) => (
          <div
            key={w.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDropWidget(w.id)}
            className={`relative ${w.span === 'full' ? 'lg:col-span-2' : ''}`}
          >
            <div
              draggable
              onDragStart={() => { dragId.current = w.id }}
              onDragEnd={() => { dragId.current = null }}
              className="absolute -top-2 -left-2 z-10 cursor-grab active:cursor-grabbing border border-grey-mid bg-black px-1.5 py-0.5 font-mono text-xs text-grey-light hover:text-white hover:border-white transition-colors"
              title="Drag to reorder"
            >
              ⠿
            </div>
            {widgetBody(w.id)}
          </div>
        ))}
      </div>
    </div>
  )
}
