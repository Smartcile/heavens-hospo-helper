'use client'

// Product details editor (menu area). Edits the fields that feed the training
// / product-reference guides — tasting notes, vintage, how to serve — plus the
// equipment links. Writes directly to the product, so the menu, the recipes
// page and every linked guide read the same record.

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { MenuItemEquipmentEditor } from '@/components/admin/MenuItemEquipmentEditor'

interface Props {
  menuItemId: string
  menuItemName: string
  venueId?: string | null
  onClose: () => void
  onSaved?: () => void
}

const textareaClass =
  'w-full bg-black border border-grey-mid text-white font-sans text-sm px-3 py-2 outline-none focus:border-white placeholder:text-grey-light resize-y'

export function MenuItemDetailsModal({ menuItemId, menuItemName, venueId, onClose, onSaved }: Props) {
  const [tastingNotes, setTastingNotes] = useState('')
  const [vintage, setVintage] = useState('')
  const [howToServe, setHowToServe] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { load() }, [menuItemId])

  async function load() {
    setLoading(true)
    const r = await fetch(`/api/admin/menu-items/${menuItemId}`)
    if (r.ok) {
      const item = await r.json()
      setTastingNotes(item.tastingNotes ?? '')
      setVintage(item.vintage ?? '')
      setHowToServe(item.howToServe ?? '')
    }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    setMessage('')
    const r = await fetch(`/api/admin/menu-items/${menuItemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tastingNotes: tastingNotes || null,
        vintage: vintage || null,
        howToServe: howToServe || null,
      }),
    })
    setMessage(r.ok ? 'SAVED' : 'SAVE FAILED')
    setSaving(false)
    if (r.ok) onSaved?.()
  }

  return (
    <Modal isOpen onClose={onClose} title={`PRODUCT INFO — ${menuItemName}`} size="lg">
      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-3">
              <label className="font-mono text-xs uppercase text-grey-light block mb-1">TASTING NOTES</label>
              <textarea
                value={tastingNotes}
                onChange={(e) => setTastingNotes(e.target.value)}
                placeholder="CRISP, CITRUS, MINERAL FINISH…"
                rows={3}
                className={textareaClass}
              />
            </div>
            <div>
              <label className="font-mono text-xs uppercase text-grey-light block mb-1">VINTAGE / YEAR</label>
              <input
                value={vintage}
                onChange={(e) => setVintage(e.target.value.toUpperCase())}
                placeholder="2024 / NV"
                className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-none focus:border-white placeholder:text-grey-light"
              />
            </div>
            <div className="md:col-span-3">
              <label className="font-mono text-xs uppercase text-grey-light block mb-1">HOW TO SERVE</label>
              <textarea
                value={howToServe}
                onChange={(e) => setHowToServe(e.target.value)}
                placeholder="CHILLED, POUR 150ML, GARNISH WITH LIME…"
                rows={3}
                className={textareaClass}
              />
            </div>
          </div>

          <div className="border-t border-grey-mid pt-3">
            <label className="font-mono text-xs uppercase text-grey-light block mb-2">
              EQUIPMENT — WHAT IT IS SERVED IN / WITH
            </label>
            <MenuItemEquipmentEditor menuItemId={menuItemId} venueId={venueId} />
          </div>

          <div className="flex items-center gap-2 border-t border-grey-mid pt-3">
            <Button onClick={save} disabled={saving}>{saving ? 'SAVING…' : 'SAVE'}</Button>
            <Button variant="ghost" onClick={onClose}>CLOSE</Button>
            {message && <span className="font-mono text-xs uppercase text-success">{message}</span>}
          </div>
        </div>
      )}
    </Modal>
  )
}
