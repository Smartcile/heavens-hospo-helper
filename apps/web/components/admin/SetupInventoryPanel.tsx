'use client'

import { Button } from '@/components/ui/Button'
import type { InventoryShortage } from '@hospo-ops/types'

interface SetupInventoryPanelProps {
  activeSetupId: string | null
  shortages: InventoryShortage[] | null
  onCheck: () => void
  checking: boolean
}

export function SetupInventoryPanel({
  activeSetupId, shortages, onCheck, checking,
}: SetupInventoryPanelProps) {
  const inactive = !activeSetupId

  return (
    <div className="border border-grey-mid p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase text-grey-light tracking-wider">
          INVENTORY CHECK
        </h3>
        <Button size="sm" onClick={onCheck} disabled={inactive || checking}>
          {checking ? 'CHECKING...' : 'CHECK'}
        </Button>
      </div>

      {inactive ? (
        <p className="font-mono text-[10px] text-grey-light uppercase">
          SELECT A SETUP TO CHECK INVENTORY
        </p>
      ) : shortages === null ? (
        <p className="font-mono text-[10px] text-grey-light uppercase">
          CLICK CHECK TO RUN INVENTORY AUDIT
        </p>
      ) : shortages.length === 0 ? (
        <p className="font-mono text-[10px] text-success uppercase">
          ALL ITEMS SUFFICIENT
        </p>
      ) : (
        <div className="space-y-1.5">
          {shortages.map((s) => (
            <div key={s.itemId} className="font-mono text-[10px]">
              <div className="text-danger uppercase">
                {s.itemName} — {s.shortage} SHORT
              </div>
              <div className="text-grey-light">
                {s.required} REQUIRED / {s.available} AVAILABLE
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
