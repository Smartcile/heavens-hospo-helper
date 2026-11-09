import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { sanitiseHelpRichText } from '@/lib/rich-text'
import { visibleHelpArticles, type HelpArticleView } from '@/lib/help'

// Worker help: auth-only, EVERYONE + WORKER articles. No grants required.
export async function GET() {
  const session = await getWorkerSession()
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

  return NextResponse.json(visibleHelpArticles(articles, 'WORKER'))
}
