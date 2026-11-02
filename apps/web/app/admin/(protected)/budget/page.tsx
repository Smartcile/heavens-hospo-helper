import { redirect } from 'next/navigation'

// The old 12-month grid selector screen is gone — budget always opens on the
// current month; the month nav lives on the detail page itself.
export default function BudgetPage() {
  const now = new Date()
  redirect(`/admin/budget/${now.getFullYear()}/${now.getMonth() + 1}`)
}
