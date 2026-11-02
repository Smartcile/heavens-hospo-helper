'use client'

import { SearchSelect } from '@/components/ui/SearchSelect'

export interface AddSelectOption {
  value: string
  label: string
}

export interface AddSelectGroup {
  label: string
  options: AddSelectOption[]
}

interface Props {
  groups: AddSelectGroup[]
  /** Values already added — hidden from the list so nothing can be picked twice. */
  selected?: string[]
  onAdd: (value: string) => void
  placeholder?: string
  className?: string
  /** Shown inside the open list when every option has already been added. */
  emptyLabel?: string
}

/**
 * A searchable, grouped "add one" picker. Drop it anywhere a user adds items
 * from a list: it renders the shared `SearchSelect` dropdown (group headers +
 * type-to-filter) but stays an *add* control — the value is always empty, so
 * picking an item fires `onAdd` and resets. Options already in `selected` are
 * filtered out, so a chosen item disappears from the list everywhere.
 */
export function AddSelect({ groups, selected = [], onAdd, placeholder, className, emptyLabel }: Props) {
  const taken = new Set(selected)
  const visibleGroups = groups
    .map((g) => ({ label: g.label, options: g.options.filter((o) => !taken.has(o.value)) }))
    .filter((g) => g.options.length > 0)

  return (
    <SearchSelect
      groups={visibleGroups}
      value=""
      onChange={(v) => { if (v) onAdd(v) }}
      placeholder={placeholder}
      className={className}
      emptyLabel={emptyLabel ?? 'ALL ADDED'}
    />
  )
}
