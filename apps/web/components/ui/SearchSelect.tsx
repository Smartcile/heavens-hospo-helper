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
  footerAction?: { label: string; onClick: () => void }
  /** Shown inside the open list when there is nothing to pick. */
  emptyLabel?: string
  disabled?: boolean
}

interface Entry {
  option: Option
  group: string | null
}

export function SearchSelect({ options, groups, value, onChange, placeholder, className, footerAction, emptyLabel, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const allEntries: Entry[] = []

  if (groups) {
    for (const g of groups) {
      for (const o of g.options) allEntries.push({ option: o, group: g.label })
    }
  } else if (options) {
    for (const o of options) allEntries.push({ option: o, group: null })
  }

  const filtered = query
    ? allEntries.filter((e) => e.option.label.toLowerCase().includes(query.toLowerCase()))
    : allEntries

  // Group headers follow the first VISIBLE option per group, so a header is
  // not lost when the group's first option is filtered out by the search.
  const headerAt = new Set<number>()
  let lastGroup: string | null = null
  filtered.forEach((entry, index) => {
    if (!entry.group) {
      lastGroup = null
      return
    }
    if (entry.group !== lastGroup) headerAt.add(index)
    lastGroup = entry.group
  })

  const selectedLabel = allEntries.find((e) => e.option.value === value)?.option.label ?? ''

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
    if (disabled) return
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
      if (filtered[highlightIdx]) select(filtered[highlightIdx].option.value)
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
          onChange={(e) => { if (disabled) return; setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { if (disabled) return; setOpen(true); setQuery('') }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full bg-black border font-mono text-xs px-3 py-2 outline-none placeholder:text-grey-light disabled:opacity-40 disabled:cursor-not-allowed ${
            open ? 'border-white text-white' : 'border-grey-mid text-white focus:border-white'
          }`}
        />
        {value && !disabled && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(''); setQuery('') }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-grey-light hover:text-danger font-mono text-xs leading-none"
          >
            ×
          </button>
        )}
      </div>
      {open && (filtered.length > 0 || footerAction) && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-grey-mid bg-black max-h-60 overflow-y-auto shadow-lg">
          {filtered.map((entry, i) => (
            <div key={`${entry.group ?? ''}:${entry.option.value}:${i}`}>
              {headerAt.has(i) && (
                <div className="px-3 py-1 font-mono text-xs uppercase text-grey-light border-b border-grey-mid bg-grey-dark/30">
                  {entry.group}
                </div>
              )}
              <button
                onClick={() => select(entry.option.value)}
                onMouseEnter={() => setHighlightIdx(i)}
                className={`block w-full text-left px-3 py-2 font-mono text-xs uppercase ${
                  i === highlightIdx
                    ? 'bg-grey-mid/30 text-white'
                    : value === entry.option.value
                    ? 'bg-grey-mid/20 text-white'
                    : 'text-grey-light hover:bg-grey-mid/20 hover:text-white'
                }`}
              >
                {entry.option.label}
              </button>
            </div>
          ))}
          {footerAction && (
            <button
              onClick={(e) => { e.preventDefault(); setOpen(false); setQuery(''); footerAction.onClick() }}
              className="block w-full text-left px-3 py-2 font-mono text-xs uppercase text-info hover:bg-grey-mid/20 border-t border-grey-mid sticky bottom-0 bg-black"
            >
              + {footerAction.label}
            </button>
          )}
        </div>
      )}
      {open && filtered.length === 0 && !footerAction && (query.trim() || emptyLabel) && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-grey-mid bg-black p-3">
          <p className="font-mono text-xs text-grey-light uppercase">{query.trim() ? 'NO RESULTS' : emptyLabel}</p>
        </div>
      )}
    </div>
  )
}
