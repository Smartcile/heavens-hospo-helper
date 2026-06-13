'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkerTaskView } from '@hospo-ops/types'

type TaskState = WorkerTaskView
type ModalTask = TaskState | null

let inactivityTimer: ReturnType<typeof setTimeout> | null = null

export function WorkerTasksClient() {
  const router = useRouter()
  const [tasks, setTasks] = useState<TaskState[]>([])
  const [firstName, setFirstName] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTask, setActiveTask] = useState<ModalTask>(null)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [completing, setCompleting] = useState(false)
  const [completionError, setCompletionError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

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
    const r = await fetch('/api/worker/tasks')
    if (r.status === 401) { router.push('/w/login'); return }
    const data = await r.json()
    setTasks(data.tasks)
    setFirstName(data.firstName)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openTask(t: TaskState) {
    if (t.isCompleted) return
    setActiveTask(t)
    setNote('')
    setPhoto(null)
    setCompletionError('')
  }

  async function handleComplete() {
    if (!activeTask) return
    setCompleting(true)
    setCompletionError('')

    let r: Response

    if (activeTask.completionType === 'TICK_PHOTO' && photo) {
      const form = new FormData()
      form.append('note', note)
      form.append('photo', photo)
      r = await fetch(`/api/worker/tasks/${activeTask.id}/complete`, {
        method: 'POST',
        body: form,
      })
    } else {
      r = await fetch(`/api/worker/tasks/${activeTask.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: note || null }),
      })
    }

    if (!r.ok) {
      const data = await r.json()
      setCompletionError(data.error ?? 'FAILED TO COMPLETE TASK')
      setCompleting(false)
      return
    }

    setCompleting(false)
    setActiveTask(null)
    await load()
  }

  async function handleLogout() {
    await fetch('/api/worker/logout', { method: 'POST' })
    router.push('/w/login')
  }

  const pending = tasks.filter((t) => !t.isCompleted)
  const done = tasks.filter((t) => t.isCompleted)
  const allDone = tasks.length > 0 && pending.length === 0

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

  if (allDone) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center gap-6">
        <div className="w-16 h-16 border-4 border-success flex items-center justify-center">
          <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="font-mono text-2xl font-bold uppercase tracking-widest text-success">
            ALL DONE
          </h1>
          <p className="font-mono text-sm text-white mt-1 uppercase">NICE WORK, {firstName}!</p>
        </div>
        <p className="font-mono text-xs text-grey-light uppercase">
          {tasks.length} TASK{tasks.length !== 1 ? 'S' : ''} COMPLETED TODAY
        </p>
        <button
          onClick={handleLogout}
          className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors mt-4"
        >
          SIGN OUT
        </button>
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
              {getGreeting()}, {firstName}
            </h1>
            <p className="font-mono text-xs text-grey-light mt-0.5 uppercase">
              {done.length} OF {tasks.length} TASKS COMPLETE
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 mt-1">
            <button
              onClick={() => router.push('/w/training')}
              className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
            >
              MY TRAINING →
            </button>
            <button
              onClick={handleLogout}
              className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
            >
              SIGN OUT
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 bg-grey-mid h-1.5">
          <div
            className="h-full bg-success transition-all duration-500"
            style={{ width: `${tasks.length > 0 ? (done.length / tasks.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Pending tasks */}
      <div className="px-4 py-4 space-y-2">
        {pending.map((t) => (
          <button
            key={t.id}
            onClick={() => openTask(t)}
            className="w-full text-left bg-grey-dark border border-grey-mid p-4 hover:border-white transition-colors active:bg-black"
          >
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 border-2 border-grey-mid flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-mono font-semibold text-sm uppercase text-white">{t.title}</div>
                {t.description && (
                  <p className="font-sans text-xs text-grey-light mt-0.5">{t.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {t.departmentName && (
                    <span className="font-mono text-xs text-grey-light">[{t.departmentName}]</span>
                  )}
                  <CompletionTypeIcon type={t.completionType} />
                  {t.guide && <span className="font-mono text-xs text-grey-light">📖 GUIDE</span>}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Completed tasks */}
      {done.length > 0 && (
        <div className="px-4 pb-6">
          <div className="font-mono text-xs text-grey-light uppercase mb-2 tracking-wider">
            COMPLETED
          </div>
          <div className="space-y-1">
            {done.map((t) => (
              <div key={t.id} className="bg-grey-dark border border-grey-mid p-3 flex items-center gap-3 opacity-60">
                <div className="w-5 h-5 border-2 border-success bg-success flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="font-mono text-xs uppercase text-success line-through">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completion modal */}
      {activeTask && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-4 border-b border-grey-mid">
            <button
              onClick={() => setActiveTask(null)}
              className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors"
            >
              ← BACK
            </button>
            <span className="font-mono text-xs text-grey-light">{activeTask.completionType.replace('_', ' + ')}</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6">
            <div>
              <h2 className="font-mono text-xl font-bold uppercase text-white">{activeTask.title}</h2>
              {activeTask.description && (
                <p className="font-sans text-sm text-grey-light mt-2">{activeTask.description}</p>
              )}
              {activeTask.departmentName && (
                <p className="font-mono text-xs text-grey-light mt-1 uppercase">[{activeTask.departmentName}]</p>
              )}
              {activeTask.guide && (
                <button
                  onClick={() => router.push(`/w/training?module=${activeTask.guide!.id}`)}
                  className="mt-3 inline-block font-mono text-xs uppercase border border-grey-mid px-3 py-2 text-white hover:border-white transition-colors"
                >
                  📖 VIEW GUIDE: {activeTask.guide.title}
                </button>
              )}
            </div>

            {(activeTask.completionType === 'TICK_NOTE' || activeTask.completionType === 'TICK_PHOTO') && (
              <div className="space-y-2">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider">
                  {activeTask.completionType === 'TICK_PHOTO' ? 'NOTE (OPTIONAL)' : 'NOTE'}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ADD YOUR NOTES HERE..."
                  className="w-full bg-grey-dark border border-grey-mid text-white font-sans text-sm px-3 py-3 outline-none focus:border-white min-h-[120px] resize-none placeholder:text-grey-light"
                />
              </div>
            )}

            {activeTask.completionType === 'TICK_PHOTO' && (
              <div className="space-y-2">
                <label className="font-mono text-xs uppercase text-grey-light tracking-wider">PHOTO</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-grey-mid flex flex-col items-center justify-center gap-1 hover:border-white transition-colors"
                >
                  {photo ? (
                    <div className="text-center">
                      <div className="font-mono text-xs text-success uppercase">PHOTO SELECTED</div>
                      <div className="font-mono text-xs text-grey-light mt-0.5">{photo.name}</div>
                    </div>
                  ) : (
                    <>
                      <svg className="w-6 h-6 text-grey-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="font-mono text-xs uppercase text-grey-light">TAP TO ADD PHOTO</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {completionError && (
              <div className="border-l-4 border-l-danger pl-3 py-1">
                <p className="font-mono text-xs text-danger">{completionError}</p>
              </div>
            )}
          </div>

          <div className="px-4 pb-8 pt-4 border-t border-grey-mid">
            <button
              onClick={handleComplete}
              disabled={completing}
              className="w-full h-14 bg-success text-black font-mono font-bold text-sm uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {completing ? 'SAVING_' : 'MARK DONE'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CompletionTypeIcon({ type }: { type: string }) {
  if (type === 'TICK_NOTE') {
    return <span className="font-mono text-xs text-grey-light">+ NOTE</span>
  }
  if (type === 'TICK_PHOTO') {
    return <span className="font-mono text-xs text-grey-light">+ PHOTO</span>
  }
  return null
}
