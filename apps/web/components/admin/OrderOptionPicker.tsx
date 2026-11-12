'use client'

import { describeOptionGroup, formatPriceDelta, type MenuOptionGroup } from '@/lib/menu-options'
import {
  describeOrderLineOptions,
  optionPriceDelta,
  toggleOptionSelection,
  type OrderLineOption,
} from '@/lib/order-options'

/**
 * Choose a product's option groups for one order line. Presentational: the
 * caller supplies the live groups and owns the selection state. Single-select
 * groups behave like radios; multi-select groups behave like capped checkboxes.
 */
export function OrderOptionPicker({
  groups,
  value,
  onChange,
  disabled = false,
}: {
  groups: MenuOptionGroup[]
  value: OrderLineOption[]
  onChange: (options: OrderLineOption[]) => void
  disabled?: boolean
}) {
  if (groups.length === 0) return null

  const delta = optionPriceDelta(value)
  const summary = describeOrderLineOptions(value)

  return (
    <div className="border border-grey-mid p-2 space-y-2">
      {groups.map((group) => {
        const groupId = group.id
        if (!groupId) return null
        const selectedIds = new Set(value.filter((v) => v.groupId === groupId).map((v) => v.choiceId))

        return (
          <div key={groupId} className="space-y-1">
            <div className="font-mono text-xs uppercase text-grey-light">
              {describeOptionGroup(group)}
            </div>
            <div className="flex flex-wrap gap-1">
              {group.choices.map((choice) => {
                if (!choice.id) return null
                const active = selectedIds.has(choice.id)
                return (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={active}
                    onClick={() => onChange(toggleOptionSelection(groups, value, groupId, choice.id as string))}
                    className={`font-mono text-xs uppercase border px-1.5 py-1 disabled:opacity-40 ${
                      active
                        ? 'text-black bg-white border-white'
                        : 'text-white border-grey-mid hover:border-white'
                    }`}
                  >
                    {choice.name}
                    {choice.priceDelta > 0 && (
                      <span className={active ? 'text-black ml-1' : 'text-grey-light ml-1'}>
                        {formatPriceDelta(choice.priceDelta)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {summary && (
        <div className="flex items-center justify-between gap-2 font-mono text-xs text-grey-light uppercase">
          <span className="truncate">{summary}</span>
          {delta > 0 && <span className="text-white shrink-0">{formatPriceDelta(delta)}</span>}
        </div>
      )}
    </div>
  )
}
