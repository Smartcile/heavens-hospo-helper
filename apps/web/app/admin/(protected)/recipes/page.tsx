import { RecipesClient } from './RecipesClient'

export const dynamic = 'force-dynamic'

export default function RecipesPage() {
  return (
    <div className="min-h-screen bg-black p-4 md:p-6">
      <RecipesClient />
    </div>
  )
}
