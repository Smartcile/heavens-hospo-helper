'use client'

// SwiftPOS menu-item mapping — every SwiftPOS product grouped by its POS
// category, with the local products that carry that `swiftPosId`. Orphans and
// duplicate codes are surfaced rather than silently resolved. See MENUS.md §8.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { pushToast } from '@/components/ui/Toast'
import {
  UNCATEGORISED,
  groupProductsByCategory,
  type CodeGroup,
  type MenuItemRef,
  type ProductLinkRow,
} from '@/lib/swiftpos-products'

interface Payload {
  venueName: string
  baseUrl: string
  total: number
  truncated: boolean
  rows: ProductLinkRow[]
  orphans: CodeGroup[]
  duplicates: CodeGroup[]
  linkedCount: number
  unlinkedCount: number
  menuItems: MenuItemRef[]
}

export function SwiftPosMenuLinks({ venueId }: { venueId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!venueId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/swiftpos/menu-links?venueId=${encodeURIComponent(venueId)}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setData(null)
        setError(String(body.error ?? 'COULD NOT LOAD SWIFTPOS PRODUCTS'))
        return
      }
      setData(body as Payload)
    } catch {
      setData(null)
      setError('COULD NOT REACH THE SERVER')
    } finally {
      setLoading(false)
    }
  }, [venueId])

  useEffect(() => { load() }, [load])

  async function setLink(menuItemId: string, swiftPosId: string | null) {
    setBusy(`${swiftPosId ?? 'UNLINK'}:${menuItemId}`)
    const res = await fetch('/api/admin/swiftpos/menu-links', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueId, menuItemId, swiftPosId }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy('')
    if (!res.ok) {
      pushToast(String(body.error ?? 'ACTION FAILED'), 'error')
      return
    }
    pushToast(swiftPosId ? 'PRODUCT LINKED' : 'PRODUCT UNLINKED', 'success')
    await load()
  }

  const categories = useMemo(() => {
    const names = new Set<string>()
    for (const row of data?.rows ?? []) names.add(row.category.trim() || UNCATEGORISED)
    return [{ value: 'ALL', label: 'ALL CATEGORIES' }].concat(
      [...names].sort().map((name) => ({ value: name, label: name })),
    )
  }, [data])

  const groups = useMemo(() => {
    const needle = search.trim().toUpperCase()
    const filtered = (data?.rows ?? []).filter((row) => {
      const rowCategory = row.category.trim() || UNCATEGORISED
      if (category !== 'ALL' && rowCategory !== category) return false
      if (!needle) return true
      return [row.inventoryCode, row.description, row.printGroupName, row.masterGroupName]
        .some((value) => value.toUpperCase().includes(needle))
    })
    return groupProductsByCategory(filtered)
  }, [data, search, category])

  const unlinkedItems = useMemo(
    () => (data?.menuItems ?? []).filter((m) => !m.swiftPosId),
    [data],
  )
  const itemOptions = unlinkedItems.map((m) => ({ value: m.id, label: m.name }))

  if (loading && !data) {
    return <p className="font-mono text-xs text-grey-light loading-cursor">LOADING</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-mono text-sm uppercase tracking-widest text-white">SWIFTPOS MENU LINKS</h2>
          <p className="font-mono text-2xs uppercase text-grey-light mt-0.5">
            EVERY SWIFTPOS PRODUCT BY CATEGORY — LINK IT TO THE LOCAL PRODUCT THAT CARRIES ITS CODE.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={load} loading={loading}>↻ REFRESH</Button>
      </div>

      {error && <p className="font-mono text-xs text-danger border border-danger p-2">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-grey-mid p-3">
            <Stat label="PRODUCTS" value={String(data.total)} />
            <Stat label="LINKED" value={String(data.linkedCount)} />
            <Stat label="UNLINKED" value={String(data.unlinkedCount)} />
            <Stat label="ISSUES" value={`${data.orphans.length} ORPHAN · ${data.duplicates.length} DUPLICATE`} />
          </div>

          {data.truncated && (
            <p className="font-mono text-xs text-warning border border-warning p-2">
              SHOWING THE FIRST {data.rows.length} PRODUCTS — THE CATALOGUE EXCEEDS THE 2,000-ROW CAP.
            </p>
          )}

          {(data.duplicates.length > 0 || data.orphans.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <IssueBox
                title={`DUPLICATE CODES (${data.duplicates.length})`}
                hint="More than one local product claims the same POS code — a sale maps to only one."
                groups={data.duplicates}
              />
              <IssueBox
                title={`ORPHAN CODES (${data.orphans.length})`}
                hint="Local products whose code no longer exists in the SwiftPOS master."
                groups={data.orphans}
              />
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3 border border-grey-mid p-3">
            <Input
              aria-label="SEARCH SWIFTPOS PRODUCTS"
              placeholder="SEARCH CODE / DESCRIPTION / GROUP"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[14rem]"
            />
            <div className="min-w-[14rem]">
              <Select
                aria-label="FILTER BY CATEGORY"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={categories}
              />
            </div>
            <span className="font-mono text-2xs uppercase text-grey-light">
              {groups.reduce((sum, g) => sum + g.rows.length, 0)} SHOWN
            </span>
          </div>

          {groups.length === 0 ? (
            <p className="font-mono text-xs text-grey-light border border-grey-mid p-3 uppercase">
              NO PRODUCTS MATCH THIS FILTER.
            </p>
          ) : (
            groups.map((group) => {
              const isCollapsed = collapsed[group.category] === true
              const linked = group.rows.filter((r) => r.linked.length > 0).length
              return (
                <div key={group.category} className="border border-grey-mid">
                  <button
                    type="button"
                    onClick={() => setCollapsed({ ...collapsed, [group.category]: !isCollapsed })}
                    className="w-full px-3 py-2 border-b border-grey-mid bg-grey-dark/30 text-left flex flex-wrap items-center justify-between gap-2"
                    aria-label={`${isCollapsed ? 'EXPAND' : 'COLLAPSE'} ${group.category}`}
                  >
                    <span className="font-mono text-xs uppercase tracking-wider text-white">
                      {isCollapsed ? '▸' : '▾'} {group.category}
                    </span>
                    <span className="font-mono text-2xs uppercase text-grey-light">
                      {group.rows.length} PRODUCTS · {linked} LINKED
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse font-mono text-xs">
                        <thead>
                          <tr className="bg-grey-dark/40">
                            {['CODE', 'DESCRIPTION', 'GROUPS', 'STATUS', 'ACTION'].map((h) => (
                              <th key={h} className="text-left uppercase tracking-wider text-grey-light px-3 py-1.5 border-b border-grey-mid whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            <tr key={row.inventoryCode} className="border-b border-grey-mid last:border-b-0 text-white align-top">
                              <td className="px-3 py-2 whitespace-nowrap">{row.inventoryCode}</td>
                              <td className="px-3 py-2">
                                {row.description || '—'}
                                {row.discontinued && <span className="ml-2 text-danger uppercase">DISCONTINUED</span>}
                              </td>
                              <td className="px-3 py-2 text-grey-light">
                                {[row.printGroupName, row.masterGroupName].filter(Boolean).join(' · ') || '—'}
                              </td>
                              <td className="px-3 py-2">
                                <Status row={row} />
                              </td>
                              <td className="px-3 py-2 min-w-[16rem]">
                                {row.linked.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {row.linked.map((item) => (
                                      <Button
                                        key={item.id}
                                        size="sm"
                                        variant="danger"
                                        aria-label={`UNLINK ${row.inventoryCode} FROM ${item.name}`}
                                        onClick={() => setLink(item.id, null)}
                                        loading={busy === `UNLINK:${item.id}`}
                                      >
                                        UNLINK {item.name}
                                      </Button>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Select
                                      aria-label={`LOCAL PRODUCT FOR ${row.inventoryCode}`}
                                      value={selected[row.inventoryCode] ?? ''}
                                      onChange={(e) => setSelected({ ...selected, [row.inventoryCode]: e.target.value })}
                                      options={itemOptions}
                                      placeholder="CHOOSE PRODUCT"
                                      className="min-w-[12rem]"
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      aria-label={`LINK ${row.inventoryCode}`}
                                      disabled={!selected[row.inventoryCode]}
                                      onClick={() => setLink(selected[row.inventoryCode], row.inventoryCode)}
                                      loading={busy === `${row.inventoryCode}:${selected[row.inventoryCode] ?? ''}`}
                                    >
                                      LINK
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          )}

          <p className="font-mono text-2xs uppercase text-grey-light leading-tight">
            LINKING WRITES <span className="text-white">MENUITEM.SWIFTPOSID</span> ONLY — IT DOES NOT PUSH TO
            WOOCOMMERCE. A CODE CAN BELONG TO ONE LOCAL PRODUCT; USE UNLINK FIRST TO MOVE IT.
          </p>
        </>
      )}
    </div>
  )
}

function Status({ row }: { row: ProductLinkRow }) {
  if (row.linked.length === 0) {
    return <span className="uppercase text-grey-light">UNLINKED</span>
  }
  if (row.linked.length > 1) {
    return (
      <span className="uppercase text-danger">
        DUPLICATE ×{row.linked.length}
        <span className="block text-2xs text-grey-light normal-case">{row.linked.map((l) => l.name).join(' · ')}</span>
      </span>
    )
  }
  return (
    <span className="uppercase text-success">
      LINKED
      <span className="block text-2xs text-white normal-case">{row.linked[0].name}</span>
    </span>
  )
}

function IssueBox({ title, hint, groups }: { title: string; hint: string; groups: CodeGroup[] }) {
  return (
    <div className={`border p-3 ${groups.length > 0 ? 'border-danger' : 'border-grey-mid'}`}>
      <div className="font-mono text-xs uppercase tracking-wider text-white">{title}</div>
      <div className="font-mono text-2xs uppercase text-grey-light mt-0.5">{hint}</div>
      {groups.length === 0 ? (
        <p className="font-mono text-2xs uppercase text-success mt-2">NONE.</p>
      ) : (
        <div className="mt-2 space-y-1">
          {groups.map((group) => (
            <div key={group.code} className="font-mono text-xs text-danger">
              {group.code}
              <span className="text-grey-light"> — {group.items.map((i) => i.name).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-2xs uppercase text-grey-light mb-0.5">{label}</div>
      <div className="font-mono text-sm text-white">{value}</div>
    </div>
  )
}
