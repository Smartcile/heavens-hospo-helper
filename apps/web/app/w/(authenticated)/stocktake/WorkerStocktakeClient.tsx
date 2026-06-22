'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface LineItem { id: string; itemId: string; countedQuantity: number; expectedQuantity: number; variance: number; item: { id: string; name: string; unit: string; category: { id: string; name: string } } }
interface Record { id: string; date: string; status: string; notes: string | null; lineItems: LineItem[] }

export function WorkerStocktakeClient() {
  const [records, setRecords] = useState<{ id: string; date: string; status: string; notes: string | null; _count: { lineItems: number } }[]>([])
  const [active, setActive] = useState<Record | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function loadList() {
    setLoading(true)
    const r = await fetch('/api/worker/stocktake')
    if (r.ok) setRecords(await r.json())
    setLoading(false)
  }

  useEffect(() => { loadList() }, [])

  async function openRecord(id: string) {
    const r = await fetch(`/api/worker/stocktake/${id}`)
    if (r.ok) setActive(await r.json())
  }

  function updateCount(itemId: string, val: number) {
    if (!active) return
    setActive({
      ...active,
      lineItems: active.lineItems.map((li) =>
        li.itemId === itemId
          ? { ...li, countedQuantity: val, variance: val - li.expectedQuantity }
          : li,
      ),
    })
  }

  async function saveAndClose(status: 'IN_PROGRESS' | 'COMPLETED') {
    if (!active) return
    setSaving(true)
    await fetch(`/api/worker/stocktake/${active.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineItems: active.lineItems.map((li) => ({
          itemId: li.itemId,
          countedQuantity: li.countedQuantity,
          expectedQuantity: li.expectedQuantity,
        })),
        status,
      }),
    })
    setSaving(false)
    setActive(null)
    loadList()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  if (active) {
    const hasVariance = active.lineItems.some((li) => li.variance !== 0)

    return (
      <div className="min-h-screen bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-grey-mid">
          <div>
            <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-white">STOCKTAKE</h1>
            <p className="font-mono text-[10px] text-grey-light">{active.date}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => saveAndClose('IN_PROGRESS')} loading={saving}>SAVE</Button>
            <Button size="sm" onClick={() => saveAndClose('COMPLETED')} loading={saving}>DONE</Button>
          </div>
        </div>

        {hasVariance && (
          <div className="bg-danger/10 border-b border-danger px-4 py-2">
            <p className="font-mono text-[10px] text-danger">SOME COUNTS DON'T MATCH — TAP ITEMS TO REVIEW</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {active.lineItems.map((li) => (
            <div key={li.id} className={`bg-grey-dark border p-3 ${li.variance !== 0 ? 'border-danger/50' : 'border-grey-mid'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs text-white uppercase">{li.item.name}</span>
                <span className="font-mono text-[10px] text-grey-light">{li.item.category.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-[10px] text-grey-light">EXPECTED: {li.expectedQuantity} {li.item.unit}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateCount(li.itemId, Math.max(0, li.countedQuantity - 1))}
                    className="w-7 h-7 bg-black border border-grey-mid text-white font-mono text-xs">−</button>
                  <span className="w-10 text-center font-mono text-sm text-white">{li.countedQuantity}</span>
                  <button onClick={() => updateCount(li.itemId, li.countedQuantity + 1)}
                    className="w-7 h-7 bg-black border border-grey-mid text-white font-mono text-xs">+</button>
                </div>
                {li.variance !== 0 && (
                  <span className={`font-mono text-[10px] ${li.variance > 0 ? 'text-accent' : 'text-danger'}`}>
                    {li.variance > 0 ? '+' : ''}{li.variance}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black p-4">
      <h1 className="font-mono text-sm font-bold uppercase tracking-widest text-white mb-4">STOCKTAKES</h1>
      {records.length === 0 && (
        <p className="font-mono text-xs text-grey-light">No pending stocktakes.</p>
      )}
      <div className="space-y-2">
        {records.map((r) => (
          <div key={r.id} onClick={() => openRecord(r.id)}
            className="bg-grey-dark border border-grey-mid p-3 cursor-pointer hover:border-white transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-white">{r.date}</span>
              <span className="font-mono text-[10px] text-grey-light">{r._count.lineItems} items</span>
            </div>
            {r.notes && <p className="font-mono text-[10px] text-grey-light mt-1">{r.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
