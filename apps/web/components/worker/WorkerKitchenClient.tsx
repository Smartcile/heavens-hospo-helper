'use client'

import { useEffect, useState, useCallback } from 'react'

interface KitchenTable {
  tableNumber: string
  items: { orderId: string; name: string; dietaryInfo: string | null; qty: number; kitchenStatus: string }[]
}

interface ItemTotal {
  name: string
  qty: number
  dietaryInfo: string | null
}

const REFRESH_MS = 15_000

export function WorkerKitchenClient() {
  const [tables, setTables] = useState<KitchenTable[]>([])
  const [unassigned, setUnassigned] = useState<{ orderId: string; name: string; dietaryInfo: string | null; qty: number; kitchenStatus: string }[]>([])
  const [itemTotals, setItemTotals] = useState<ItemTotal[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const r = await fetch('/api/worker/kitchen')
    if (r.ok) {
      const data = await r.json()
      setTables(Array.isArray(data.tables) ? data.tables : [])
      setUnassigned(Array.isArray(data.unassigned) ? data.unassigned : [])
      setItemTotals(Array.isArray(data.itemTotals) ? data.itemTotals : [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING KITCHEN</p>
      </div>
    )
  }

  const hasData = tables.length > 0 || unassigned.length > 0

  return (
    <div className="min-h-screen bg-black p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">KITCHEN</h1>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-grey-light uppercase">AUTO-REFRESH 15S</span>
          <span className="font-mono text-xs text-white">{itemTotals.reduce((s, t) => s + t.qty, 0)} ITEMS</span>
        </div>
      </div>

      {!hasData ? (
        <div className="border border-grey-mid p-8 text-center">
          <p className="font-mono text-xs text-grey-light uppercase">NO ORDERS FOR TODAY</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border border-grey-mid p-4">
            <h2 className="font-mono text-xs uppercase text-grey-light tracking-wider mb-3">PREP TOTALS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {itemTotals.map((t) => (
                <div key={t.name} className="flex items-center justify-between gap-2 bg-grey-dark/30 border border-grey-mid px-3 py-2">
                  <div className="min-w-0">
                    <span className="font-mono text-sm text-white uppercase truncate block">{t.name}</span>
                    {t.dietaryInfo && (
                      <span className="font-mono text-[9px] text-[#c4a530] uppercase">{t.dietaryInfo}</span>
                    )}
                  </div>
                  <span className="font-mono text-xl text-white shrink-0">×{t.qty}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {tables.map((t) => (
              <div key={t.tableNumber} className="border border-grey-mid">
                <div className="px-3 py-2 bg-grey-dark/30 border-b border-grey-mid">
                  <span className="font-mono text-xs font-bold text-white uppercase">TABLE {t.tableNumber}</span>
                  <span className="font-mono text-[10px] text-grey-light ml-2">
                    {t.items.reduce((s, i) => s + i.qty, 0)} ITEMS
                  </span>
                </div>
                <div className="divide-y divide-grey-mid">
                  {t.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs text-white uppercase">{item.name}</span>
                        {item.dietaryInfo && (
                          <span className="font-mono text-[9px] text-[#c4a530] border border-[#c4a530] px-1 ml-1 uppercase">
                            {item.dietaryInfo}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-white shrink-0 ml-2">×{item.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {unassigned.length > 0 && (
              <div className="border border-grey-mid border-dashed">
                <div className="px-3 py-2 bg-grey-dark/30 border-b border-grey-mid border-dashed">
                  <span className="font-mono text-xs font-bold text-grey-light uppercase">UNASSIGNED</span>
                  <span className="font-mono text-[10px] text-grey-light ml-2">
                    {unassigned.reduce((s, i) => s + i.qty, 0)} ITEMS
                  </span>
                </div>
                <div className="divide-y divide-grey-mid">
                  {unassigned.map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs text-white uppercase">{item.name}</span>
                        {item.dietaryInfo && (
                          <span className="font-mono text-[9px] text-[#c4a530] border border-[#c4a530] px-1 ml-1 uppercase">
                            {item.dietaryInfo}
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs text-white shrink-0 ml-2">×{item.qty}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
