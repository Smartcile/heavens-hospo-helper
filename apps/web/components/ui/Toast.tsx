'use client'

import { useState, useEffect } from 'react'

interface ToastItem {
  id: number
  message: string
  type: 'error' | 'success' | 'info'
}

let toastId = 0
const listeners: Set<(item: ToastItem) => void> = new Set()

export function pushToast(message: string, type: 'error' | 'success' | 'info' = 'info') {
  const item: ToastItem = { id: ++toastId, message, type }
  for (const fn of listeners) fn(item)
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const handler = (item: ToastItem) => {
      setItems((prev) => [...prev, item])
      setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== item.id)), 3000)
    }
    listeners.add(handler)
    return () => { listeners.delete(handler) }
  }, [])

  if (items.length === 0) return null

  const colour = (t: string) =>
    t === 'error' ? 'border-red-600 text-red-400' :
    t === 'success' ? 'border-green-600 text-green-400' :
    'border-grey-mid text-grey-light'

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-xs">
      {items.map((t) => (
        <div key={t.id}
          className={`bg-black border ${colour(t.type)} font-mono text-xs uppercase px-3 py-2 shadow-lg cursor-pointer`}
          onClick={() => setItems((prev) => prev.filter((i) => i.id !== t.id))}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
