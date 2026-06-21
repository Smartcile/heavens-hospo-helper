'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  firstName: string
}

export function WorkerHamburgerMenu({ firstName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [noticeCount, setNoticeCount] = useState(0)

  useEffect(() => {
    if (!open) return
    fetch('/api/worker/notices')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setNoticeCount(d.unackedRequired ?? 0) })
      .catch(() => {})
  }, [open])

  const go = useCallback((path: string) => {
    setOpen(false)
    router.push(path)
  }, [router])

  async function handleLogout() {
    await fetch('/api/worker/logout', { method: 'POST' })
    setOpen(false)
    router.push('/w/login')
  }

  const items = [
    {
      label: 'DASHBOARD',
      sub: 'HOME',
      icon: (
        <path strokeLinecap="square" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      ),
      action: () => go('/w/dashboard'),
    },
    {
      label: 'NOTICES',
      sub: noticeCount > 0 ? `${noticeCount} UNACKNOWLEDGED` : 'VIEW NOTICES',
      badge: noticeCount,
      icon: (
        <path strokeLinecap="square" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      ),
      action: () => go('/w/notices'),
    },
    {
      label: 'TASKS',
      sub: 'DUE TODAY',
      icon: (
        <path strokeLinecap="square" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      ),
      action: () => go('/w/tasks'),
    },
    {
      label: 'MY SCHEDULE',
      sub: 'SHIFTS & TIME OFF',
      icon: (
        <path strokeLinecap="square" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      ),
      action: () => go('/w/calendar'),
    },
    {
      label: 'MY TRAINING',
      sub: 'MODULES & GUIDES',
      icon: (
        <path strokeLinecap="square" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      ),
      action: () => go('/w/training'),
    },
    {
      label: 'SOPS & GUIDES',
      sub: 'REFERENCE MATERIAL',
      icon: (
        <path strokeLinecap="square" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      ),
      action: () => go('/w/sops'),
    },
  ]

  return (
    <>
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(true)}
        className="p-2 -mr-2 hover:opacity-70 transition-opacity"
        aria-label="Open menu"
      >
        <div className="w-5 h-[1px] bg-grey-light mb-[5px]" />
        <div className="w-5 h-[1px] bg-grey-light mb-[5px]" />
        <div className="w-5 h-[1px] bg-grey-light" />
        {noticeCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-danger rounded-full" />
        )}
      </button>

      {/* Full-screen overlay */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
            <span className="font-mono text-xs text-grey-light uppercase">{firstName}</span>
            <button
              onClick={() => setOpen(false)}
              className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
            >
              CLOSE ✕
            </button>
          </div>

          {/* Grid of blocks */}
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3 content-start">
            {items.map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className="bg-grey-dark border border-grey-mid p-5 text-left hover:border-white transition-colors active:bg-black flex flex-col gap-2 relative"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 border border-grey-mid flex items-center justify-center">
                    <svg className="w-4 h-4 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {item.icon}
                    </svg>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="font-mono text-xs text-danger font-bold">{item.badge}</span>
                  )}
                </div>
                <span className="font-mono text-sm font-bold uppercase text-white">{item.label}</span>
                <span className="font-mono text-[10px] uppercase text-grey-light">{item.sub}</span>
              </button>
            ))}
          </div>

          {/* Sign out */}
          <div className="px-4 pb-8 pt-3">
            <button
              onClick={handleLogout}
              className="w-full h-12 border border-danger text-danger font-mono text-xs font-bold uppercase tracking-widest hover:bg-danger hover:text-black transition-colors"
            >
              SIGN OUT
            </button>
          </div>
        </div>
      )}
    </>
  )
}
