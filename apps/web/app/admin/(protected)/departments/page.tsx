import { DepartmentsClient } from '@/components/admin/DepartmentsClient'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function DepartmentsPage() {
  const session = await getServerSession(authOptions)
  return <DepartmentsClient role={session!.user.role} venueId={session!.user.venueId} />
}
