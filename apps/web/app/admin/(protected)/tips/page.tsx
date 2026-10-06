import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'
import { authOptions } from '@/lib/auth'
import { TipsClient } from '@/components/admin/TipsClient'

export const dynamic = 'force-dynamic'

export default async function TipsPage() {
  const session = await getServerSession(authOptions)
  const cookieStore = cookies()
  const venueId =
    cookieStore.get('admin-active-venue')?.value ??
    session?.user.defaultVenueId ??
    session?.user.venueId ??
    ''

  return (
    <div className="min-h-screen bg-black p-4 md:p-6">
      <TipsClient venueId={venueId} />
    </div>
  )
}
