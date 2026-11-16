'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getActiveVenueId } from '@/lib/active-venue'
import { pushToast } from '@/components/ui/Toast'
import { CustomerGroupsPanel } from '@/components/admin/CustomerGroupsPanel'
import { MemberDrawer } from '@/components/admin/MemberDrawer'
import { MemberImportModal } from '@/components/admin/MemberImportModal'
import type { CustomerGroupRow, MembershipRow } from '@/components/admin/member-types'

interface Props {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}

export function MembersPanel({ role, sessionVenueId, defaultVenueId }: Props) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)
  const [groups, setGroups] = useState<CustomerGroupRow[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [selectedGroupId, setSelectedGroupId] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [members, setMembers] = useState<MembershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true)
    try {
      const params = new URLSearchParams()
      if (venueId) params.set('venueId', venueId)
      const res = await fetch(`/api/admin/customer-groups${params.toString() ? `?${params}` : ''}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'COULD NOT LOAD CUSTOMER DATABASES')
        return
      }
      const rows = (body.groups ?? []) as CustomerGroupRow[]
      setGroups(rows)
      setSelectedGroupId((current) =>
        current === 'ALL' || rows.some((g) => g.id === current) ? current : 'ALL',
      )
      setError('')
    } catch {
      setError('COULD NOT LOAD CUSTOMER DATABASES')
    } finally {
      setGroupsLoading(false)
    }
  }, [venueId])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (venueId) params.set('venueId', venueId)
      if (selectedGroupId !== 'ALL') params.set('groupId', selectedGroupId)
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('status', showInactive ? 'all' : 'active')
      const res = await fetch(`/api/admin/customer-memberships?${params.toString()}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'COULD NOT LOAD MEMBERS')
        return
      }
      setMembers((body.memberships ?? []) as MembershipRow[])
      setError('')
    } catch {
      setError('COULD NOT LOAD MEMBERS')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, selectedGroupId, showInactive, venueId])

  useEffect(() => {
    void loadMembers()
  }, [loadMembers])

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  )

  function exportCsv(status: 'active' | 'inactive' | 'all') {
    if (!selectedGroup) {
      pushToast('CHOOSE A DATABASE FIRST', 'error')
      return
    }
    const params = new URLSearchParams({ groupId: selectedGroup.id, status })
    if (venueId) params.set('venueId', venueId)
    window.open(`/api/admin/customer-memberships/export?${params.toString()}`, '_blank')
  }

  const importGroup = selectedGroup ?? groups[0] ?? null

  return (
    <div className="space-y-4 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white">CUSTOMER DATABASES</h1>
          <p className="font-mono text-xs uppercase text-grey-light">
            BOOKING CUSTOMERS + IMPORTED MEMBERS · {members.length} SHOWN
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setManageOpen(true)}>
            MANAGE DATABASES
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (!importGroup) {
                setManageOpen(true)
                return
              }
              setImportOpen(true)
            }}
          >
            ⬆ IMPORT CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!selectedGroup}
            onClick={() => exportCsv('active')}
          >
            ⬇ SWIFT POS CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-grey-mid pb-2">
        <button
          onClick={() => setSelectedGroupId('ALL')}
          className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wider border ${
            selectedGroupId === 'ALL'
              ? 'border-white bg-white text-black'
              : 'border-grey-mid text-grey-light hover:border-white hover:text-white'
          }`}
        >
          ALL
        </button>
        {groups.map((group) => (
          <button
            key={group.id}
            onClick={() => setSelectedGroupId(group.id)}
            className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wider border ${
              selectedGroupId === group.id
                ? 'border-white bg-white text-black'
                : 'border-grey-mid text-grey-light hover:border-white hover:text-white'
            }`}
            title={group.description ?? undefined}
          >
            {group.name}
            <span className="ml-2 opacity-60">{group.memberCount}</span>
          </button>
        ))}
        {!groupsLoading && groups.length === 0 && (
          <span className="px-2 py-1.5 font-mono text-xs uppercase text-grey-light">
            NO DATABASES YET — USE MANAGE DATABASES
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH NAME, NUMBER, EMAIL OR PHONE..."
          className="max-w-md"
        />
        <button
          onClick={() => setShowInactive((v) => !v)}
          className={`px-3 py-1.5 font-mono text-xs uppercase tracking-wider border ${
            showInactive
              ? 'border-white text-white'
              : 'border-grey-mid text-grey-light hover:border-white hover:text-white'
          }`}
        >
          {showInactive ? 'SHOWING INACTIVE' : 'SHOW INACTIVE'}
        </button>
        {selectedGroup?.kind === 'GIFT_CARD' && (
          <span className="font-mono text-xs uppercase text-grey-light">
            MEMBER NUMBER = GIFT CARD NUMBER
          </span>
        )}
      </div>

      {error && <p className="font-mono text-xs text-danger">{error}</p>}

      {loading ? (
        <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
      ) : members.length === 0 ? (
        <div className="border border-grey-mid p-4 space-y-2">
          <p className="font-mono text-xs text-grey-light">
            {debouncedSearch ? 'NO MEMBERS MATCH THAT SEARCH.' : 'NO MEMBERS IN THIS DATABASE YET.'}
          </p>
          {groups.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
              ⬆ IMPORT CSV
            </Button>
          )}
        </div>
      ) : (
        <div className="border border-grey-mid divide-y divide-grey-mid">
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-grey-dark/30 font-mono text-2xs uppercase tracking-wider text-grey-light">
            <span className="col-span-2">NUMBER</span>
            <span className="col-span-4">NAME</span>
            <span className="col-span-3">DATABASE</span>
            <span className="col-span-2">TYPE / CONTACT</span>
            <span className="col-span-1 text-right">STATUS</span>
          </div>
          {members.map((member) => (
            <button
              key={member.id}
              onClick={() => setSelectedMemberId(member.id)}
              className="w-full text-left grid grid-cols-1 md:grid-cols-12 gap-2 px-4 py-3 hover:bg-grey-mid/10 transition-colors"
            >
              <div className="md:col-span-2 font-mono text-sm text-white">{member.membershipNumber}</div>
              <div className="md:col-span-4 min-w-0">
                <div className="font-mono text-sm text-white uppercase truncate">
                  {member.displayName || `${member.firstName} ${member.lastName}`}
                </div>
                <div className="font-mono text-2xs uppercase text-grey-light truncate">
                  {member.isFamily ? `FAMILY · ${member.familySurnames || member.lastName}` : ''}
                  {member.isFamily && member.isPrimary ? ' · PRIMARY' : ''}
                  {member.customerName && member.customerName !== member.displayName
                    ? ` · CUSTOMER: ${member.customerName}`
                    : ''}
                </div>
              </div>
              <div className="md:col-span-3 font-mono text-xs uppercase text-grey-light truncate">
                {member.groupName}
              </div>
              <div className="md:col-span-2 min-w-0">
                <div className="font-mono text-xs uppercase text-grey-light truncate">
                  {member.memberType || (member.groupKind === 'GIFT_CARD' ? 'GIFT CARD' : 'MEMBER')}
                </div>
                <div className="font-mono text-2xs text-grey-light truncate">
                  {member.email || member.phone || member.memberInterests || ''}
                </div>
              </div>
              <div className="md:col-span-1 text-left md:text-right">
                <span
                  className={`inline-block px-2 py-0.5 font-mono text-2xs uppercase tracking-wider border ${
                    member.isActive
                      ? 'border-success/60 text-success'
                      : 'border-danger/60 text-danger'
                  }`}
                >
                  {member.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <MemberDrawer
        isOpen={selectedMemberId !== null}
        membershipId={selectedMemberId}
        venueId={venueId}
        onClose={() => setSelectedMemberId(null)}
        onSaved={() => {
          void loadMembers()
          void loadGroups()
        }}
      />

      <CustomerGroupsPanel
        isOpen={manageOpen}
        groups={groups}
        venueId={venueId}
        onClose={() => setManageOpen(false)}
        onChanged={() => {
          void loadGroups()
          void loadMembers()
        }}
      />

      {importGroup && (
        <MemberImportModal
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
          venueId={venueId}
          groups={groups}
          defaultGroupId={selectedGroup?.id ?? importGroup.id}
          onImported={() => {
            void loadGroups()
            void loadMembers()
          }}
        />
      )}
    </div>
  )
}
