'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { pushToast } from '@/components/ui/Toast'
import { describePaxRange } from '@/lib/menu-rules'
import { getActiveVenueId } from '@/lib/active-venue'
import { MenuItemServesEditor } from '@/components/admin/MenuItemServesEditor'
import { MenuBuilder, type MenuOptionProduct, type MenuOptionStock } from '@/components/admin/MenuBuilder'
import { MenuImportModal } from '@/components/admin/MenuImportModal'
import type { MenuShape } from '@/lib/menu-lines'

export function MenusClient({ role, sessionVenueId, defaultVenueId }: { role: string; sessionVenueId: string; defaultVenueId?: string | null }) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [menus, setMenus] = useState<MenuShape[]>([])
  const [products, setProducts] = useState<MenuOptionProduct[]>([])
  const [inventory, setInventory] = useState<MenuOptionStock[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [servesItem, setServesItem] = useState<{ id: string; name: string } | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  async function load() {
    setLoading(true)
    const venueParam = venueId ? `?venueId=${venueId}` : ''
    const [mRes, oRes] = await Promise.all([
      fetch(`/api/admin/menus${venueParam}`),
      fetch(`/api/admin/menus/options${venueParam}`),
    ])
    if (mRes.ok) setMenus(await mRes.json())
    if (oRes.ok) {
      const data = await oRes.json()
      setProducts(data.products ?? [])
      setInventory(data.inventory ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function removeMenu(id: string) {
    if (!confirm('DELETE THIS MENU?')) return
    const res = await fetch(`/api/admin/menus/${id}`, { method: 'DELETE' })
    if (res.ok) { pushToast('MENU DELETED', 'success'); setSelectedId(null); load() }
    else pushToast('DELETE FAILED', 'error')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 p-6">
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      </div>
    )
  }

  const editingMenu = selectedId && selectedId !== 'new' ? menus.find((m) => m.id === selectedId) ?? null : null

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">MENUS</h1>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-grey-light">{menus.length} MENUS</span>
          {selectedId == null && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>⬆ IMPORT MENU</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedId('new')}>+ NEW MENU</Button>
            </>
          )}
        </div>
      </div>

      {selectedId == null && (
        <>
          <p className="font-mono text-xs text-grey-light">
            EACH MENU GROUPS ITS OWN LINES. ADDING A PRODUCT TO A MENU DOES NOT AFFECT ANY OTHER MENU.
          </p>

          <div className="space-y-2">
            {menus.length === 0 ? (
              <div className="border border-grey-mid p-8 text-center">
                <p className="font-mono text-xs text-grey-light uppercase">NO MENUS YET</p>
                <p className="font-mono text-xs text-grey-light mt-1">
                  CREATE ONE FOR EACH SERVICE
                </p>
              </div>
            ) : (
              menus.map((m) => {
                const range = describePaxRange(m)
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className="w-full text-left border border-grey-mid p-3 hover:bg-grey-mid/10"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-white uppercase truncate">{m.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {range && <span className="font-mono text-xs text-grey-light border border-grey-mid px-1">{range}</span>}
                        <span className={`font-mono text-xs uppercase border px-1 ${m.isActive ? 'text-success border-success' : 'text-grey-light border-grey-mid'}`}>
                          {m.isActive ? 'ACTIVE' : 'OFF'}
                        </span>
                      </div>
                    </div>
                    <p className="font-mono text-xs text-grey-light mt-1">
                      {m.items.length} ITEM{m.items.length === 1 ? '' : 'S'}
                      {m.groups.length > 0 ? ` · ${m.groups.length} GROUP${m.groups.length === 1 ? '' : 'S'}` : ''}
                      {m.description ? ` · ${m.description}` : ''}
                    </p>
                  </button>
                )
              })
            )}
          </div>
        </>
      )}

      {selectedId != null && (
        <MenuBuilder
          menu={editingMenu}
          venueId={venueId ?? ''}
          products={products}
          inventory={inventory}
          onClose={() => setSelectedId(null)}
          onSaved={() => { setSelectedId(null); load() }}
          onOpenServes={(line) => setServesItem(line)}
        />
      )}

      <Modal
        isOpen={!!servesItem}
        onClose={() => setServesItem(null)}
        title={servesItem ? `ITEM LINK — ${servesItem.name}` : 'ITEM LINK'}
        size="lg"
      >
        {servesItem && (
          <MenuItemServesEditor menuItemId={servesItem.id} menuItemName={servesItem.name} venueId={venueId ?? ''} />
        )}
      </Modal>

      {importOpen && (
        <MenuImportModal
          venueId={venueId ?? ''}
          menus={menus.map((m) => ({ id: m.id, name: m.name }))}
          products={products.map((p) => ({ id: p.id, name: p.name }))}
          onClose={() => setImportOpen(false)}
          onImported={(id) => { setImportOpen(false); setSelectedId(id); void load() }}
        />
      )}
    </div>
  )
}


