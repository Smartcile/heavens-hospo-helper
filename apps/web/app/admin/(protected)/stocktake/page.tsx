import { StocktakeClient } from './StocktakeClient'

export const dynamic = 'force-dynamic'

export default function StocktakePage() {
  return (
    <div className="min-h-screen bg-black p-6">
      <StocktakeClient />
    </div>
  )
}
