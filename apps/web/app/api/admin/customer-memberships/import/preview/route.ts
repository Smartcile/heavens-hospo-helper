import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { buildMemberPreview, type MemberColumnMap } from '@/lib/member-import'
import { loadExistingForGroup } from '@/lib/customer-memberships.server'

export const runtime = 'nodejs'

const MAX_FILE_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.edit')
  if (denied) return denied

  const form = await req.formData()
  const venueRaw = form.get('venueId')
  const scoped = resolveScopedVenueId(session, req, typeof venueRaw === 'string' ? venueRaw : undefined)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'CHOOSE A CSV FILE' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'CSV IS TOO LARGE (MAX 10MB)' }, { status: 413 })
  }
  const name = file.name.toLowerCase()
  if (!name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
    return NextResponse.json({ error: 'ONLY CSV FILES ARE SUPPORTED' }, { status: 415 })
  }

  let columnMap: Partial<MemberColumnMap> | undefined
  const rawMap = form.get('columnMap')
  if (typeof rawMap === 'string' && rawMap.trim()) {
    try {
      columnMap = JSON.parse(rawMap) as Partial<MemberColumnMap>
    } catch {
      return NextResponse.json({ error: 'COLUMN MAP IS NOT VALID JSON' }, { status: 422 })
    }
  }

  const groupId = typeof form.get('groupId') === 'string' ? String(form.get('groupId')) : ''
  const existing = groupId
    ? await loadExistingForGroup(scoped.venueId, groupId)
    : { existing: {}, previousPrimaryName: {} }

  const text = await file.text()
  const preview = buildMemberPreview(text, {
    columnMap,
    existing: existing.existing,
    previousPrimaryName: existing.previousPrimaryName,
  })

  return NextResponse.json({ venueId: scoped.venueId, fileName: file.name, preview })
}
