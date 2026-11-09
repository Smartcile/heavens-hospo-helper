import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { sanitiseHelpRichText } from '@/lib/rich-text'
import { visibleHelpArticles, type HelpArticleView } from '@/lib/help'

// Auth-only (no permission guard): every signed-in manager can read the help
// catalogue. Admins see EVERYONE + ADMIN articles.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await prisma.helpArticle.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })

  const articles: HelpArticleView[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    audience: row.audience as HelpArticleView['audience'],
    sortOrder: row.sortOrder,
    bodyHtml: sanitiseHelpRichText(row.bodyHtml ?? ''),
  }))

  return NextResponse.json(visibleHelpArticles(articles, 'ADMIN'))
}
