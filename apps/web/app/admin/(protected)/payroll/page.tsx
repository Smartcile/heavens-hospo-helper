import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { PayrollClient } from '@/components/admin/PayrollClient'

export default async function PayrollPage() {
  const session = await getServerSession(authOptions)
  return (
    <PayrollClient
      role={session?.user?.role ?? ''}
      sessionVenueId={session?.user?.venueId ?? ''}
      defaultVenueId={session?.user?.defaultVenueId ?? null}
    />
  )
}
