import { prisma } from '../index'
import { HELP_ARTICLES } from '../../../apps/web/content/help/articles'
import { helpContentHash } from '../../../apps/web/lib/help'

/**
 * Sync the repo-authored Heavenly Help pack into `HelpArticle`.
 *
 * Idempotent and deploy-safe: rows are written only when the content hash
 * changes (so `updatedAt` stays truthful), and slugs removed from the pack are
 * soft-deleted rather than dropped.
 */
async function main() {
  let created = 0
  let updated = 0
  let unchanged = 0

  for (const article of HELP_ARTICLES) {
    const contentHash = helpContentHash(article)
    const existing = await prisma.helpArticle.findUnique({ where: { slug: article.slug } })

    if (!existing) {
      await prisma.helpArticle.create({
        data: {
          slug: article.slug,
          title: article.title,
          summary: article.summary,
          category: article.category,
          audience: article.audience,
          sortOrder: article.sortOrder,
          bodyHtml: article.bodyHtml,
          contentHash,
        },
      })
      created++
      continue
    }

    if (existing.contentHash !== contentHash || existing.deletedAt) {
      await prisma.helpArticle.update({
        where: { id: existing.id },
        data: {
          title: article.title,
          summary: article.summary,
          category: article.category,
          audience: article.audience,
          sortOrder: article.sortOrder,
          bodyHtml: article.bodyHtml,
          contentHash,
          isActive: true,
          deletedAt: null,
        },
      })
      updated++
    } else {
      unchanged++
    }
  }

  const slugs = HELP_ARTICLES.map((a) => a.slug)
  const removed = await prisma.helpArticle.updateMany({
    where: { slug: { notIn: slugs }, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })

  console.log(
    `Heavenly Help sync: ${created} created, ${updated} updated, ${unchanged} unchanged, ${removed.count} retired.`,
  )
}

main()
  .catch((e) => {
    console.error('Heavenly Help seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
