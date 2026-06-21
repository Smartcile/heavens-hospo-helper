'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import Image from 'next/image'

interface QRCodeItem {
  id: string
  label: string
  venueId: string
  isActive: boolean
  url: string
  qrDataUrl: string
  venue: { id: string; name: string }
}

interface Venue { id: string; name: string }

interface FormState {
  label: string
  venueId: string
}

const EMPTY_FORM: FormState = { label: '', venueId: '' }

export function QRCodesClient({ role, sessionVenueId }: { role: string; sessionVenueId: string }) {
  const [codes, setCodes] = useState<QRCodeItem[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [viewCode, setViewCode] = useState<QRCodeItem | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [cR, vR] = await Promise.all([
      fetch('/api/admin/qrcodes'),
      fetch('/api/admin/venues'),
    ])
    const [codesData, venueData] = await Promise.all([cR.json(), vR.json()])
    setCodes(codesData)
    setVenues(venueData)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setForm({ ...EMPTY_FORM, venueId: role === 'MANAGER' ? sessionVenueId : '' })
    setError('')
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.venueId || !form.label.trim()) {
      setError('VENUE AND LABEL ARE REQUIRED')
      return
    }
    setSaving(true)
    setError('')

    const r = await fetch('/api/admin/qrcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId: form.venueId, label: form.label }),
    })

    if (!r.ok) {
      const data = await r.json()
      setError(data.error ?? 'SAVE FAILED')
      setSaving(false)
      return
    }

    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function handleToggle(code: QRCodeItem) {
    await fetch(`/api/admin/qrcodes/${code.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !code.isActive }),
    })
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('DELETE THIS QR CODE?')) return
    await fetch(`/api/admin/qrcodes/${id}`, { method: 'DELETE' })
    load()
  }

  function downloadQR(code: QRCodeItem) {
    const a = document.createElement('a')
    a.href = code.qrDataUrl
    a.download = `${code.label.replace(/\s+/g, '-')}.png`
    a.click()
  }

  const venueOptions = venues.map((v) => ({ value: v.id, label: v.name }))

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-xl font-bold uppercase tracking-widest">QR CODES</h1>
        <Button onClick={openCreate} size="sm">+ GENERATE QR CODE</Button>
      </div>

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {codes.length === 0 && (
            <p className="font-mono text-xs text-grey-light col-span-full">NO QR CODES FOUND.</p>
          )}
          {codes.map((code) => (
            <div key={code.id} className="bg-grey-dark border border-grey-mid p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono font-semibold text-sm uppercase text-white">{code.label}</div>
                  <div className="font-mono text-xs text-grey-light">{code.venue.name}</div>
                </div>
                <Badge variant={code.isActive ? 'success' : 'danger'}>
                  {code.isActive ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              </div>

              <div
                className="cursor-pointer border border-grey-mid p-2 flex items-center justify-center bg-white"
                onClick={() => setViewCode(code)}
              >
                <Image src={code.qrDataUrl} alt={code.label} width={160} height={160} />
              </div>

              <div className="font-mono text-xs text-grey-light break-all bg-black/40 p-2 border border-grey-mid">
                {code.url}
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => downloadQR(code)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                  DOWNLOAD PNG
                </button>
                <button onClick={() => handleToggle(code)} className="font-mono text-xs uppercase text-grey-light hover:text-white transition-colors">
                  {code.isActive ? 'DEACTIVATE' : 'ACTIVATE'}
                </button>
                <button onClick={() => handleDelete(code.id)} className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors">
                  DELETE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="GENERATE QR CODE">
        <div className="space-y-4">
          <Input
            label="Label"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="BAR ENTRY QR"
          />
          {role === 'ADMIN' && (
            <Select
              label="Venue"
              value={form.venueId}
              onChange={(e) => setForm({ ...form, venueId: e.target.value })}
              options={venueOptions}
              placeholder="SELECT VENUE"
            />
          )}
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} loading={saving}>GENERATE</Button>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>CANCEL</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!viewCode} onClose={() => setViewCode(null)} title={viewCode?.label} size="sm">
        {viewCode && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4">
              <Image src={viewCode.qrDataUrl} alt={viewCode.label} width={240} height={240} />
            </div>
            <div className="font-mono text-xs text-grey-light text-center break-all">
              {viewCode.url}
            </div>
            <Button onClick={() => downloadQR(viewCode)}>DOWNLOAD PNG</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
