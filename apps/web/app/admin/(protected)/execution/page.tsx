import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'
import { ExecutionClient } from '@/components/admin/ExecutionClient'

export default async function ExecutionPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const activeVenueId = cookies().get('admin-active-venue')?.value ?? session.user.defaultVenueId ?? undefined

  return (
    <ExecutionClient
      role={session.user.role}
      sessionVenueId={session.user.venueId}
      defaultVenueId={activeVenueId}
    />
  )
}
