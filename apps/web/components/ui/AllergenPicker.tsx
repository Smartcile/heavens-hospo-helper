'use client'

import { useState, useRef, useEffect } from 'react'
import { ALLERGENS, type Allergen, type AllergenSource, allergenTooltip } from '@/lib/allergens'

interface Props {
  value: string
  onChange: (value: string) => void
  inherited?: AllergenSource[]
  placeholder?: string
  className?: string
  label?: string
}

export function AllergenPicker({ value, onChange, inherited, placeholder, className, label }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = value
    ? value.toUpperCase().split(',').map((a) => a.trim()).filter((a) => ALLERGENS.includes(a as Allergen)) as Allergen[]
    : []

  const inheritedAllergens = inherited
    ? [...new Set(inherited.map((s) => s.allergen))]
    : []

  const filtered = ALLERGENS.filter((a) => {
    if (selected.includes(a) || inheritedAllergens.includes(a)) return false
    if (!search.trim()) return true
    return a.includes(search.toUpperCase())
  })

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function add(a: Allergen) {
    const next = [...selected, a]
    onChange(next.join(', '))
    setSearch('')
    setOpen(false)
  }

  function remove(a: Allergen) {
    onChange(selected.filter((s) => s !== a).join(', '))
  }

  return (
    <div ref={containerRef} className={`flex flex-col gap-1 ${className ?? ''}`}>
      {label && (
        <label className="font-mono text-xs uppercase text-grey-light tracking-wider">{label}</label>
      )}
      <div className="relative">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'SEARCH ALLERGENS...'}
          className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light"
        />
        {open && (filtered.length > 0 || search.trim()) && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 border border-grey-mid bg-black max-h-40 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 font-mono text-xs text-grey-light">{search.trim() ? 'NO MATCH' : 'NO ALLERGENS MATCH'}</div>
            ) : (
              filtered.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => add(a)}
                  className="w-full text-left px-3 py-1.5 font-mono text-xs uppercase border-b border-grey-mid/30 last:border-0 hover:bg-grey-mid/20 text-grey-light hover:text-white"
                >
                  {a}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Tag display */}
      {(inheritedAllergens.length > 0 || selected.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {inheritedAllergens.map((a) => {
            const source = inherited?.find((s) => s.allergen === a)
            return (
              <span
                key={`inh-${a}`}
                className="inline-flex items-center gap-1 font-mono text-[9px] uppercase px-1.5 py-0.5 border text-[#c4a530] border-[#c4a530]/50 bg-[#c4a530]/10"
                title={source ? allergenTooltip(source) : ''}
              >
                🔒 {a}
              </span>
            )
          })}
          {selected.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1 font-mono text-[9px] uppercase px-1.5 py-0.5 border text-[#c4a530] border-[#c4a530]"
            >
              {a}
              <button
                onClick={() => remove(a)}
                className="text-[#c4a530] hover:text-white ml-0.5"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
