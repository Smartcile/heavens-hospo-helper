'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { pushToast } from '@/components/ui/Toast'
import type { MembershipRow } from '@/components/admin/member-types'

interface Props {
  isOpen: boolean
  membershipId: string | null
  venueId: string
  onClose: () => void
  onSaved: () => void
}

interface FormState {
  firstName: string
  lastName: string
  memberType: string
  email: string
  phone: string
  memberInterests: string
  company: string
  familySurnames: string
  isFamily: boolean
  isActive: boolean
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  memberType: '',
  email: '',
  phone: '',
  memberInterests: '',
  company: '',
  familySurnames: '',
  isFamily: false,
  isActive: true,
}

export function MemberDrawer({ isOpen, membershipId, venueId, onClose, onSaved }: Props) {
  const [member, setMember] = useState<MembershipRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !membershipId) return
    setLoading(true)
    setError('')
    setMember(null)
    const params = new URLSearchParams()
    if (venueId) params.set('venueId', venueId)
    fetch(`/api/admin/customer-memberships/${membershipId}?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(body.error || 'COULD NOT LOAD MEMBER')
          return
        }
        const row = body.membership as MembershipRow
        setMember(row)
        setForm({
          firstName: row.firstName,
          lastName: row.lastName,
          memberType: row.memberType ?? '',
          email: row.email ?? '',
          phone: row.phone ?? '',
          memberInterests: row.memberInterests ?? '',
          company: row.company ?? '',
          familySurnames: row.familySurnames ?? '',
          isFamily: row.isFamily,
          isActive: row.isActive,
        })
      })
      .catch(() => setError('COULD NOT LOAD MEMBER'))
      .finally(() => setLoading(false))
  }, [isOpen, membershipId, venueId])

  async function save() {
    if (!member) return
    setBusy('save')
    setError('')
    try {
      const res = await fetch(`/api/admin/customer-memberships/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venueId, ...form }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'SAVE FAILED')
        return
      }
      setMember(body.membership as MembershipRow)
      pushToast('MEMBER SAVED', 'success')
      onSaved()
    } catch {
      setError('SAVE FAILED')
    } finally {
      setBusy('')
    }
  }

  async function archive() {
    if (!member) return
    if (!window.confirm(`ARCHIVE MEMBER ${member.membershipNumber}? THE RECORD IS KEPT BUT HIDDEN.`)) return
    setBusy('archive')
    setError('')
    try {
      const params = new URLSearchParams()
      if (venueId) params.set('venueId', venueId)
      const res = await fetch(`/api/admin/customer-memberships/${member.id}?${params.toString()}`, {
        method: 'DELETE',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'ARCHIVE FAILED')
        return
      }
      pushToast('MEMBER ARCHIVED', 'success')
      onSaved()
      onClose()
    } catch {
      setError('ARCHIVE FAILED')
    } finally {
      setBusy('')
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="MEMBER DETAILS" size="lg">
      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : !member ? (
        <p className="font-mono text-xs text-danger">{error || 'MEMBER NOT FOUND'}</p>
      ) : (
        <div className="space-y-4">
          <div className="border border-grey-mid p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="font-mono text-2xs uppercase text-grey-light">NUMBER</div>
              <div className="font-mono text-sm text-white">{member.membershipNumber}</div>
            </div>
            <div>
              <div className="font-mono text-2xs uppercase text-grey-light">DATABASE</div>
              <div className="font-mono text-xs uppercase text-white">{member.groupName}</div>
            </div>
            <div>
              <div className="font-mono text-2xs uppercase text-grey-light">SOURCE</div>
              <div className="font-mono text-xs uppercase text-white">{member.source}</div>
            </div>
            <div>
              <div className="font-mono text-2xs uppercase text-grey-light">STATUS</div>
              <div className={`font-mono text-xs uppercase ${member.isActive ? 'text-success' : 'text-danger'}`}>
                {member.isActive ? 'ACTIVE' : 'INACTIVE'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input label="FIRST NAME" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            <Input label="LAST NAME" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            <Input label="MEMBER TYPE" value={form.memberType} onChange={(e) => setForm({ ...form, memberType: e.target.value })} />
            <Input label="FAMILY SURNAMES" value={form.familySurnames} onChange={(e) => setForm({ ...form, familySurnames: e.target.value })} placeholder="SMITH/JONES (Family)" />
            <Input label="EMAIL" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="PHONE" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="INTERESTS" value={form.memberInterests} onChange={(e) => setForm({ ...form, memberInterests: e.target.value })} />
            <Input label="COMPANY" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 font-mono text-xs uppercase text-grey-light">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              ACTIVE
            </label>
            <label className="flex items-center gap-2 font-mono text-xs uppercase text-grey-light">
              <input
                type="checkbox"
                checked={form.isFamily}
                onChange={(e) => setForm({ ...form, isFamily: e.target.checked })}
              />
              FAMILY MEMBERSHIP
            </label>
          </div>

          {member.customerName && (
            <p className="font-mono text-xs text-grey-light">
              LINKED CUSTOMER: <span className="text-white">{member.customerName}</span>
            </p>
          )}

          {error && <p className="font-mono text-xs text-danger">{error}</p>}

          <div className="border-t border-grey-mid pt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" loading={busy === 'save'} onClick={save}>SAVE</Button>
            <Button size="sm" variant="danger" loading={busy === 'archive'} onClick={archive}>ARCHIVE</Button>
            <Button size="sm" variant="ghost" onClick={onClose}>CLOSE</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
