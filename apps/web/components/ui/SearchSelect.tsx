'use client'

import { useEffect, useRef, useState } from 'react'

interface Option {
  value: string
  label: string
}

interface OptionGroup {
  label: string
  options: Option[]
}

interface Props {
  options?: Option[]
  groups?: OptionGroup[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function SearchSelect({ options, groups, value, onChange, placeholder, className }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const allOptions: Option[] = []
  const groupIndices: { label: string; startIdx: number }[] = []

  if (groups) {
    for (const g of groups) {
      groupIndices.push({ label: g.label, startIdx: allOptions.length })
      allOptions.push(...g.options)
    }
  } else if (options) {
    allOptions.push(...options)
  }

  const filtered = query
    ? allOptions.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : allOptions

  const selectedLabel = allOptions.find((o) => o.value === value)?.label ?? ''

  useEffect(() => {
    setHighlightIdx(0)
  }, [query])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function select(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true)
        e.preventDefault()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      setHighlightIdx((p) => Math.min(p + 1, filtered.length - 1))
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setHighlightIdx((p) => Math.max(p - 1, 0))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      if (filtered[highlightIdx]) select(filtered[highlightIdx].value)
      e.preventDefault()
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selectedLabel}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQuery('') }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-hidden focus:border-white placeholder:text-grey-light"
        />
        {value && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(''); setQuery('') }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-grey-light hover:text-danger font-mono text-xs leading-none"
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-black border border-grey-mid max-h-48 overflow-y-auto z-50 shadow-lg min-w-full">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 font-mono text-[10px] text-grey-light uppercase">NO RESULTS</div>
          ) : (
            filtered.map((o, i) => {
              const groupHeader = groups ? groupIndices.find((g) => g.startIdx === allOptions.indexOf(o)) : null
              return (
                <div key={o.value}>
                  {groupHeader && (
                    <div className="px-3 py-1 font-mono text-[9px] uppercase text-grey-light border-b border-grey-mid bg-grey-dark/50">
                      {groupHeader.label}
                    </div>
                  )}
                  <button
                    onClick={() => select(o.value)}
                    onMouseEnter={() => setHighlightIdx(i)}
                    className={`block w-full text-left px-3 py-1.5 font-mono text-xs uppercase truncate ${
                      i === highlightIdx
                        ? 'bg-grey-mid/30 text-white'
                        : value === o.value
                        ? 'bg-grey-mid/20 text-white'
                        : 'text-grey-light hover:bg-grey-mid/20 hover:text-white'
                    }`}
                  >
                    {o.label}
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
