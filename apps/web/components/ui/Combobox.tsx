'use client'

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'

interface Option {
  value: string
  label: string
  description?: string | null
}

interface ComboboxProps {
  label?: string
  options: Option[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  onPreview?: (value: string) => void
  multiple?: boolean
}

export interface ComboboxHandle {
  getFinalSelection: () => string[]
}

export const Combobox = forwardRef<ComboboxHandle, ComboboxProps>(function Combobox(
  { label, options, selected, onChange, placeholder, onPreview, multiple = true },
  ref
) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    getFinalSelection: () => selected.filter((id) => !pendingRemovals.has(id)),
  }))

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = options.filter((o) => {
    if (selected.includes(o.value)) return false
    if (!search.trim()) return true
    const s = search.toLowerCase()
    return o.label.toLowerCase().includes(s) || (o.description?.toLowerCase().includes(s) ?? false)
  })

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id))
      setPendingRemovals((prev) => { const next = new Set(prev); next.delete(id); return next })
    } else if (multiple) {
      onChange([...selected, id])
    } else {
      onChange([id])
      setOpen(false)
    }
  }

  const selectedOptions = options.filter((o) => selected.includes(o.value))

  return (
    <div ref={containerRef} className="flex flex-col gap-1">
      {label && (
        <label className="font-mono text-xs uppercase text-grey-light tracking-wider">{label}</label>
      )}

      {/* Search input — always on top */}
      <div className="relative">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'SEARCH...'}
          className="w-full bg-grey-dark border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light"
        />
        {open && filtered.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-grey-mid bg-black max-h-48 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { toggle(o.value); setSearch(''); setOpen(false) }}
                className="w-full text-left px-3 py-2 hover:bg-grey-dark transition-colors border-b border-grey-mid last:border-0"
              >
                <div className="font-mono text-xs text-white">{o.label}</div>
                {o.description && (
                  <div className="font-mono text-xs text-grey-light mt-0.5 line-clamp-2">{o.description}</div>
                )}
              </button>
            ))}
          </div>
        )}
        {open && search.trim() && filtered.length === 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-grey-mid bg-black p-3">
            <p className="font-mono text-xs text-grey-light">NO MATCHES</p>
          </div>
        )}
      </div>

      {/* Selected tags */}
      {selectedOptions.length > 0 && (
        <div className="flex flex-col gap-1">
          {selectedOptions.map((o) => {
            const isPending = pendingRemovals.has(o.value)
            return (
              <div key={o.value} className={`flex items-center justify-between border ${isPending ? 'bg-black border-grey-mid opacity-50' : 'bg-grey-dark border-grey-mid'}`}>
                <span className={`font-mono text-xs px-2 py-1 truncate min-w-0 ${isPending ? 'text-grey-light line-through' : 'text-accent'}`}>
                  {o.label}
                </span>
                <div className="flex items-center flex-shrink-0">
                  {onPreview && (
                    <button
                      type="button"
                      onClick={() => onPreview(o.value)}
                      className="font-mono text-xs text-[#60A5FA] hover:text-white px-1.5 py-1 border-r border-grey-mid transition-colors group relative"
                    >
                      <span className="opacity-50 group-hover:opacity-100 transition-opacity">🔗</span>
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 font-mono text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">LINK</span>
                    </button>
                  )}
                  {isPending ? (
                    <button
                      type="button"
                      onClick={() => setPendingRemovals((prev) => { const next = new Set(prev); next.delete(o.value); return next })}
                      className="font-mono text-xs text-success hover:text-white hover:bg-success/20 px-2 py-1 transition-colors"
                      title="UNDO REMOVE"
                    >
                      ↩
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingRemovals((prev) => new Set(prev).add(o.value))}
                      className="font-mono text-xs text-danger hover:text-white hover:bg-danger/20 px-1.5 py-1 transition-colors"
                      title="REMOVE"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
