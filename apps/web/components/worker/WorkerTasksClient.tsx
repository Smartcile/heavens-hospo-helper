'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkerTaskView } from '@hospo-ops/types'
import { WorkerHamburgerMenu } from '@/components/worker/WorkerHamburgerMenu'

type TaskState = WorkerTaskView
type ModalTask = TaskState | null

let inactivityTimer: ReturnType<typeof setTimeout> | null = null

export function WorkerTasksClient() {
  const router = useRouter()
  const [tasks, setTasks] = useState<TaskState[]>([])
  const [checklists, setChecklists] = useState<{ id: string; name: string; appearFromTime: string | null; taskIds: string[] }[]>([])
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
    setChecklists(data.checklists ?? [])
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

  const pending = tasks.filter((t) => !t.isCompleted)
  const done = tasks.filter((t) => t.isCompleted)
  const allDone = tasks.length > 0 && pending.length === 0

  // Time-gate the lists: a list shows from its appear-from time and stays until
  // every task in it is done. Tasks in no list fall back to dept → section.
  const now = new Date()
  const nowHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const isOpen = (t: string | null) => !t || nowHHmm >= t

  const listsByTask = new Map<string, { id: string; name: string; appearFromTime: string | null }[]>()
  for (const cl of checklists) {
    for (const tid of cl.taskIds) {
      const arr = listsByTask.get(tid) ?? []
      arr.push(cl)
      listsByTask.set(tid, arr)
    }
  }

  const listGroupMap = new Map<string, { id: string; name: string; time: string | null; tasks: TaskState[] }>()
  const otherTasks: TaskState[] = []
  const upcomingMap = new Map<string, { name: string; time: string | null }>()
  for (const t of pending) {
    const lists = listsByTask.get(t.id) ?? []
    if (lists.length === 0) { otherTasks.push(t); continue }
    const open = lists
      .filter((l) => isOpen(l.appearFromTime))
      .sort((a, b) => (a.appearFromTime ?? '').localeCompare(b.appearFromTime ?? '') || a.name.localeCompare(b.name))
    if (open.length === 0) {
      const next = lists.slice().sort((a, b) => (a.appearFromTime ?? '').localeCompare(b.appearFromTime ?? ''))[0]
      upcomingMap.set(next.id, { name: next.name, time: next.appearFromTime })
      continue
    }
    const g = open[0]
    let grp = listGroupMap.get(g.id)
    if (!grp) { grp = { id: g.id, name: g.name, time: g.appearFromTime, tasks: [] }; listGroupMap.set(g.id, grp) }
    grp.tasks.push(t)
  }
  const listGroups = [...listGroupMap.values()].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.name.localeCompare(b.name))
  const upcoming = [...upcomingMap.values()].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))

  // "Other" (no checklist) tasks grouped by department → section.
  const otherGroups: { dept: string; sections: { key: string; name: string | null; tasks: TaskState[] }[] }[] = []
  const dIndex = new Map<string, (typeof otherGroups)[number]>()
  for (const t of otherTasks) {
    const dName = t.departmentName ?? 'GENERAL'
    let dg = dIndex.get(dName)
    if (!dg) { dg = { dept: dName, sections: [] }; dIndex.set(dName, dg); otherGroups.push(dg) }
    const sName = t.sectionName ?? null
    const sKey = sName ?? '__none__'
    let sg = dg.sections.find((s) => s.key === sKey)
    if (!sg) { sg = { key: sKey, name: sName, tasks: [] }; dg.sections.push(sg) }
    sg.tasks.push(t)
  }

  const renderTask = (t: TaskState) => (
    <button
      key={t.id}
      onClick={() => openTask(t)}
      className="w-full text-left bg-grey-dark border border-grey-mid p-4 hover:border-white transition-colors active:bg-black"
    >
      <div className="flex items-start gap-3">
        <div className="w-5 h-5 border-2 border-grey-mid flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-mono font-semibold text-sm uppercase text-white">{t.title}</div>
          {t.description && <p className="font-sans text-xs text-grey-light mt-0.5">{t.description}</p>}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <CompletionTypeIcon type={t.completionType} />
            {t.assigneeName && <span className="font-mono text-xs text-accent">FOR {t.assigneeName}</span>}
            {t.guide && <span className="font-mono text-xs text-grey-light">📖 GUIDE</span>}
          </div>
        </div>
      </div>
    </button>
  )

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
      <div className="min-h-screen bg-black flex flex-col">
        <div className="px-4 pt-6 pb-4 border-b border-grey-mid flex items-start justify-end">
          <WorkerHamburgerMenu firstName={firstName} />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-6">
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
        </div>
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
          <WorkerHamburgerMenu firstName={firstName} />
        </div>

        {/* Progress bar */}
        <div className="mt-3 bg-grey-mid h-1.5">
          <div
            className="h-full bg-success transition-all duration-500"
            style={{ width: `${tasks.length > 0 ? (done.length / tasks.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Pending — time-gated lists first, then any other tasks by dept → section */}
      <div className="px-4 py-4 space-y-5">
        {listGroups.map((lg) => (
          <div key={lg.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2 border-b border-grey-mid pb-1">
              <span className="font-mono text-xs uppercase tracking-widest text-white">{lg.name}</span>
              {lg.time && <span className="font-mono text-[10px] uppercase text-warning">FROM {lg.time}</span>}
            </div>
            {lg.tasks.map(renderTask)}
          </div>
        ))}

        {otherGroups.map((dg) => (
          <div key={dg.dept} className="space-y-2">
            <div className="font-mono text-xs uppercase tracking-widest text-white border-b border-grey-mid pb-1">{dg.dept}</div>
            {dg.sections.map((sg) => (
              <div key={sg.key} className="space-y-2">
                {sg.name && <div className="font-mono text-[10px] uppercase tracking-wider text-accent pt-1">{sg.name}</div>}
                {sg.tasks.map(renderTask)}
              </div>
            ))}
          </div>
        ))}

        {upcoming.length > 0 && (
          <div className="border border-grey-mid p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-grey-light mb-1">OPENS LATER</div>
            {upcoming.map((u) => (
              <div key={u.name} className="font-mono text-xs text-grey-light">{u.name}{u.time ? ` · FROM ${u.time}` : ''}</div>
            ))}
          </div>
        )}
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
                <span className="font-mono text-xs uppercase text-success line-through min-w-0 truncate">{t.title}</span>
                {t.completedByName && <span className="font-mono text-[10px] uppercase text-grey-light ml-auto flex-shrink-0">BY {t.completedByName}</span>}
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
