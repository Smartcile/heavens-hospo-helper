import { SettingsClient } from '@/components/admin/SettingsClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  return <SettingsClient staffId={session!.user.id} role={session!.user.role} sessionVenueId={session!.user.venueId} />
}
