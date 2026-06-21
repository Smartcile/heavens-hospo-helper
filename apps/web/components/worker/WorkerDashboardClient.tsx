'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { WorkerHamburgerMenu } from '@/components/worker/WorkerHamburgerMenu'

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
}

let inactivityTimer: ReturnType<typeof setTimeout> | null = null

export function WorkerDashboardClient() {
  const router = useRouter()
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
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

    const [tasksR, noticesR, calR, trainingR, sopsR] = await Promise.all([
      fetch('/api/worker/tasks'),
      fetch('/api/worker/notices'),
      fetch('/api/worker/calendar'),
      fetch('/api/worker/training'),
      fetch('/api/worker/sops'),
    ])

    if (tasksR.status === 401) { router.push('/w/login'); return }

    const tasks = await tasksR.json()
    const notices = await noticesR.json()
    const cal = await calR.json()
    const training = await trainingR.json()
    const sops = await sopsR.json()

    const pending = (tasks.tasks ?? []).filter((t: { isCompleted: boolean }) => !t.isCompleted).length
    const done = (tasks.tasks ?? []).filter((t: { isCompleted: boolean }) => t.isCompleted).length

    const trainingItems = training.items ?? []
    const newTraining = trainingItems.filter((t: { completed: boolean }) => !t.completed).length

    setData({
      firstName: tasks.firstName ?? '',
      tasksPending: pending,
      tasksDone: done,
      tasksTotal: (tasks.tasks ?? []).length,
      unackedNotices: notices.unackedRequired ?? 0,
      unreadNotices: notices.items?.length ?? 0,
      upcomingShifts: (cal.shifts ?? []).length,
      trainingDone: trainingItems.filter((t: { completed: boolean }) => t.completed).length,
      trainingTotal: trainingItems.length,
      sopCount: (sops.items ?? []).length,
      newTraining,
    })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

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

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 border-b border-grey-mid">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">
              {getGreeting()}, {data?.firstName}
            </h1>
            <p className="font-mono text-xs text-grey-light mt-0.5 uppercase">TAP A SECTION TO OPEN</p>
          </div>
          <WorkerHamburgerMenu firstName={data?.firstName ?? ''} />
        </div>
      </div>

      {/* Dashboard grid */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Notices */}
        <button
          onClick={() => router.push('/w/notices')}
          className="bg-grey-dark border border-grey-mid p-5 text-left hover:border-white transition-colors active:bg-black flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 border border-grey-mid flex items-center justify-center">
              <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="square" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            {(data?.unackedNotices ?? 0) > 0 && (
              <span className="font-mono text-xs text-danger font-bold">{data?.unackedNotices} NEW</span>
            )}
          </div>
          <span className="font-mono text-sm font-bold uppercase text-white">NOTICES</span>
          <span className="font-mono text-xs text-grey-light">
            {data?.unackedNotices && data.unackedNotices > 0
              ? `${data.unackedNotices} UNACKNOWLEDGED`
              : data?.unreadNotices && data.unreadNotices > 0
                ? `${data.unreadNotices} NOTICE${data.unreadNotices !== 1 ? 'S' : ''}`
                : 'NO NEW NOTICES'}
          </span>
        </button>

        {/* Tasks */}
        <button
          onClick={() => router.push('/w/tasks')}
          className="bg-grey-dark border border-grey-mid p-5 text-left hover:border-white transition-colors active:bg-black flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 border border-grey-mid flex items-center justify-center">
              <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="square" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <span className="font-mono text-xs text-grey-light">{data?.tasksDone}/{data?.tasksTotal}</span>
          </div>
          <span className="font-mono text-sm font-bold uppercase text-white">TASKS</span>
          <span className="font-mono text-xs text-grey-light">
            {data && data.tasksTotal > 0
              ? `${data.tasksPending} PENDING · ${Math.round((data.tasksDone / data.tasksTotal) * 100)}% DONE`
              : 'NO TASKS TODAY'}
          </span>
        </button>

        {/* My Schedule */}
        <button
          onClick={() => router.push('/w/calendar')}
          className="bg-grey-dark border border-grey-mid p-5 text-left hover:border-white transition-colors active:bg-black flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 border border-grey-mid flex items-center justify-center">
              <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="square" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="font-mono text-xs text-grey-light">{data?.upcomingShifts} SHIFTS</span>
          </div>
          <span className="font-mono text-sm font-bold uppercase text-white">MY SCHEDULE</span>
          <span className="font-mono text-xs text-grey-light">
            {data && data.upcomingShifts > 0
              ? `${data.upcomingShifts} UPCOMING SHIFT${data.upcomingShifts !== 1 ? 'S' : ''}`
              : 'NO SHIFTS ROSTERED'}
          </span>
        </button>

        {/* My Training */}
        <button
          onClick={() => router.push('/w/training')}
          className="bg-grey-dark border border-grey-mid p-5 text-left hover:border-white transition-colors active:bg-black flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <div className="w-9 h-9 border border-grey-mid flex items-center justify-center">
              <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="square" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="font-mono text-xs text-grey-light">{data?.trainingDone}/{data?.trainingTotal}</span>
          </div>
          <span className="font-mono text-sm font-bold uppercase text-white">MY TRAINING</span>
          <span className="font-mono text-xs text-grey-light">
            {data && data.newTraining > 0
              ? `${data.newTraining} NEW MODULE${data.newTraining !== 1 ? 'S' : ''} TO COMPLETE`
              : data && data.trainingTotal > 0
                ? `${Math.round((data.trainingDone / data.trainingTotal) * 100)}% COMPLETE`
                : 'NO TRAINING ASSIGNED'}
          </span>
        </button>

        {/* SOPs */}
        <div className="sm:col-span-2">
          <button
            onClick={() => router.push('/w/sops')}
            className="w-full bg-grey-dark border border-grey-mid p-5 text-left hover:border-white transition-colors active:bg-black flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 border border-grey-mid flex items-center justify-center">
                <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="square" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span className="font-mono text-xs text-grey-light">{data?.sopCount} GUIDES</span>
            </div>
            <span className="font-mono text-sm font-bold uppercase text-white">SOPS & GUIDES</span>
            <span className="font-mono text-xs text-grey-light">
              {data && data.sopCount > 0
                ? `${data.sopCount} REFERENCE GUIDE${data.sopCount !== 1 ? 'S' : ''} AVAILABLE`
                : 'NO GUIDES AVAILABLE YET'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
