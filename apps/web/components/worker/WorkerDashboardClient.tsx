'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Widget = 'dashboard' | 'notices' | 'tasks' | 'calendar' | 'training' | 'sops' | 'floorplan' | 'stocktake' | 'timeclock'

interface DashData {
  firstName: string
  tasksPending: number
  tasksDone: number
  tasksTotal: number
  unackedNotices: number
  unreadNotices: number
  upcomingShifts: number
  trainingDone: number
  trainingTotal: number
  sopCount: number
  newTraining: number
  pendingStocktakes: number
  isClockedIn: boolean
}

let inactivityTimer: ReturnType<typeof setTimeout> | null = null

export function WorkerDashboardClient() {
  const router = useRouter()
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<Widget>('dashboard')
  const loaded = useRef(false)

  const expiryMinutes = Number(process.env.NEXT_PUBLIC_WORKER_SESSION_EXPIRY_MINUTES ?? 15)

  function resetInactivity() {
    if (inactivityTimer) clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(async () => {
      await fetch('/api/worker/logout', { method: 'POST' })
      router.push('/w/login')
    }, expiryMinutes * 60 * 1000)
  }

  useEffect(() => {
    const events = ['click', 'touchstart', 'keydown']
    events.forEach((e) => document.addEventListener(e, resetInactivity, { passive: true }))
    resetInactivity()
    return () => {
      events.forEach((e) => document.removeEventListener(e, resetInactivity))
      if (inactivityTimer) clearTimeout(inactivityTimer)
    }
  }, [])

  async function load() {
    if (loaded.current) return
    loaded.current = true

    const [tasksR, noticesR, calR, guidesR, sopsR, stocktakeR, clockR] = await Promise.all([
      fetch('/api/worker/tasks'),
      fetch('/api/worker/notices'),
      fetch('/api/worker/calendar'),
      fetch('/api/worker/guides'),
      fetch('/api/worker/sops'),
      fetch('/api/worker/stocktake'),
      fetch('/api/worker/timeclock/status'),
    ])

    if (tasksR.status === 401) { router.push('/w/login'); return }

    const tasks = await tasksR.json()
    const notices = await noticesR.json()
    const cal = await calR.json()
    const guides = await guidesR.json()
    const sops = await sopsR.json()
    const stocktakes = stocktakeR.ok ? await stocktakeR.json() : []
    const clock = clockR.ok ? await clockR.json() : { isClockedIn: false }

    const pending = (tasks.tasks ?? []).filter((t: { isCompleted: boolean }) => !t.isCompleted).length
    const done = (tasks.tasks ?? []).filter((t: { isCompleted: boolean }) => t.isCompleted).length

    const guideItems = guides.items ?? []
    const newGuides = guideItems.filter((t: { completed: boolean }) => !t.completed).length

    setData({
      firstName: tasks.firstName ?? '',
      tasksPending: pending,
      tasksDone: done,
      tasksTotal: (tasks.tasks ?? []).length,
      unackedNotices: notices.unackedRequired ?? 0,
      unreadNotices: notices.items?.length ?? 0,
      upcomingShifts: (cal.shifts ?? []).length,
      trainingDone: guideItems.filter((t: { completed: boolean }) => t.completed).length,
      trainingTotal: guideItems.length,
      sopCount: (sops.items ?? []).length,
      newTraining: newGuides,
      pendingStocktakes: (stocktakes ?? []).length,
      isClockedIn: clock.isClockedIn ?? false,
    })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSignOut() {
    await fetch('/api/worker/logout', { method: 'POST' })
    router.push('/w/login')
  }

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'GOOD MORNING'
    if (h < 17) return 'GOOD AFTERNOON'
    return 'GOOD EVENING'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  const tasksDone = data?.tasksDone ?? 0
  const tasksTotal = data?.tasksTotal ?? 0
  const tasksPending = data?.tasksPending ?? 0
  const allTasksDone = tasksTotal > 0 && tasksPending === 0

  const card = (
    title: string,
    subtitle: string,
    icon: JSX.Element,
    badge: string | null,
    badgeColor: string,
    borderColor: string,
    onClick: () => void
  ) => (
    <button
      onClick={onClick}
      className={`bg-grey-dark border-2 p-5 text-left hover:border-white transition-colors active:bg-black flex flex-col gap-2 ${borderColor}`}
    >
      <div className="flex items-center justify-between">
        <div className="w-9 h-9 border border-grey-mid flex items-center justify-center">
          {icon}
        </div>
        {badge && (
          <span className={`font-mono text-xs font-bold ${badgeColor}`}>{badge}</span>
        )}
      </div>
      <span className="font-mono text-sm font-bold uppercase text-white">{title}</span>
      <span className="font-mono text-xs text-grey-light">{subtitle}</span>
    </button>
  )

  if (view !== 'dashboard') {
    const src = `/w/${view}`
    return (
      <div className="fixed inset-0 z-40 bg-black flex flex-col">
        <div className="flex-1">
          <iframe src={src} className="w-full h-full border-0" />
        </div>
        <div className="p-3 bg-black border-t border-grey-mid">
          <button
            onClick={() => setView('dashboard')}
            className="w-full h-12 bg-warning/10 border border-warning/30 text-warning font-mono text-sm font-bold uppercase tracking-widest hover:bg-warning/20 hover:border-warning/50 transition-colors"
          >
            ← BACK TO DASHBOARD
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black pb-16">
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">
              {getGreeting()}, {data?.firstName}
            </h1>
            <p className="font-mono text-xs text-grey-light mt-0.5 uppercase">TAP A SECTION TO OPEN</p>
          </div>
          <button
            onClick={handleSignOut}
            className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors px-2 py-1"
          >
            SIGN OUT
          </button>
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {card(
          'NOTICES',
          data?.unackedNotices && data.unackedNotices > 0
            ? `${data.unackedNotices} UNACKNOWLEDGED`
            : data?.unreadNotices && data.unreadNotices > 0
              ? `${data.unreadNotices} NOTICE${data.unreadNotices !== 1 ? 'S' : ''}`
              : 'NO NEW NOTICES',
          <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="square" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>,
          (data?.unackedNotices ?? 0) > 0 ? `${data?.unackedNotices} NEW` : null,
          'text-danger',
          'border-grey-mid',
          () => setView('notices')
        )}

        {card(
          'TASKS',
          tasksTotal > 0
            ? `${tasksPending} PENDING · ${Math.round((tasksDone / tasksTotal) * 100)}% DONE`
            : 'NO TASKS TODAY',
          <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="square" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>,
          `${tasksDone}/${tasksTotal}`,
          'text-grey-light',
          allTasksDone ? 'border-success' : tasksPending > 0 ? 'border-danger' : 'border-grey-mid',
          () => setView('tasks')
        )}

        {card(
          'MY SCHEDULE',
          data && data.upcomingShifts > 0
            ? `${data.upcomingShifts} UPCOMING SHIFT${data.upcomingShifts !== 1 ? 'S' : ''}`
            : 'NO SHIFTS ROSTERED',
          <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="square" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>,
          `${data?.upcomingShifts} SHIFTS`,
          'text-grey-light',
          'border-grey-mid',
          () => setView('calendar')
        )}

        {card(
          'MY GUIDES',
          data && data.newTraining > 0
            ? `${data.newTraining} GUIDE${data.newTraining !== 1 ? 'S' : ''} TO COMPLETE`
            : data && data.trainingTotal > 0
              ? `${Math.round((data!.trainingDone / data!.trainingTotal) * 100)}% COMPLETE`
              : 'NO GUIDES ASSIGNED',
          <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="square" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>,
          `${data?.trainingDone}/${data?.trainingTotal}`,
          'text-grey-light',
          'border-grey-mid',
          () => setView('training')
        )}

        {card(
          'SOPS & GUIDES',
          data && data.sopCount > 0
            ? `${data.sopCount} REFERENCE GUIDE${data.sopCount !== 1 ? 'S' : ''} AVAILABLE`
            : 'NO GUIDES AVAILABLE YET',
          <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="square" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>,
          `${data?.sopCount} GUIDES`,
          'text-grey-light',
          'border-grey-mid',
          () => setView('sops')
        )}

        {card(
          'FLOOR PLAN',
          'VENUE LAYOUT',
          <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="square" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>,
          null,
          'text-grey-light',
          'border-grey-mid',
          () => setView('floorplan')
        )}

        {card(
          'STOCKTAKE',
          data && data.pendingStocktakes > 0
            ? `${data.pendingStocktakes} STOCKTAKE${data.pendingStocktakes !== 1 ? 'S' : ''} TO COMPLETE`
            : 'NO PENDING STOCKTAKES',
          <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="square" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>,
          (data?.pendingStocktakes ?? 0) > 0 ? `${data?.pendingStocktakes} PENDING` : null,
          'text-accent',
          'border-grey-mid',
          () => setView('stocktake')
        )}

        {card(
          'TIME CLOCK',
          data?.isClockedIn ? 'YOU ARE CLOCKED IN' : 'CLOCK IN / OUT',
          <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="square" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>,
          data?.isClockedIn ? 'ON DUTY' : null,
          data?.isClockedIn ? 'text-success' : 'text-grey-light',
          data?.isClockedIn ? 'border-success' : 'border-grey-mid',
          () => setView('timeclock')
        )}
      </div>
    </div>
  )
}
