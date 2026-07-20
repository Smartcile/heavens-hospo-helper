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
          className={`w-full bg-black border font-mono text-xs px-3 py-2 outline-none placeholder:text-grey-light ${
            open ? 'border-white text-white' : 'border-grey-mid text-white focus:border-white'
          }`}
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
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-grey-mid bg-black max-h-60 overflow-y-auto shadow-lg">
          {filtered.map((o, i) => {
            const fullIdx = allOptions.indexOf(o)
            const groupHeader = groups ? groupIndices.find((g) => g.startIdx === fullIdx) : null
            return (
              <div key={o.value}>
                {groupHeader && (
                  <div className="px-3 py-1 font-mono text-[9px] uppercase text-grey-light border-b border-grey-mid bg-grey-dark/30">
                    {groupHeader.label}
                  </div>
                )}
                <button
                  onClick={() => select(o.value)}
                  onMouseEnter={() => setHighlightIdx(i)}
                  className={`block w-full text-left px-3 py-2 font-mono text-xs uppercase ${
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
          })}
        </div>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-grey-mid bg-black p-3">
          <p className="font-mono text-xs text-grey-light uppercase">NO RESULTS</p>
        </div>
      )}
    </div>
  )
}
