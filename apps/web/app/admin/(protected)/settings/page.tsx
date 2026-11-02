import { SettingsClient } from '@/components/admin/SettingsClient'
import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'
import { authOptions } from '@/lib/auth'
import { sessionGrantedAreas } from '@/lib/permissions'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  const cookieStore = cookies()
  const activeVenueId = cookieStore.get('admin-active-venue')?.value ?? session!.user.defaultVenueId ?? null
  const grantedAreas = await sessionGrantedAreas(session, activeVenueId)
  return (
    <SettingsClient
      staffId={session!.user.id}
      role={session!.user.role}
      sessionVenueId={session!.user.venueId}
      defaultVenueId={session!.user.defaultVenueId ?? undefined}
      venueIsDemo={session!.user.venueIsDemo}
      grantedAreas={grantedAreas}
    />
  )
}
