import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { AdminNav } from '@/components/admin/AdminNav'

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/admin/login')
  }

  return (
    <div className="flex min-h-screen bg-black">
      <AdminNav />
      <main className="flex-1 flex flex-col min-h-screen overflow-auto">{children}</main>
    </div>
  )
}
