/**
 * Checks if docs (CLAUDE.md, ROADMAP.md) were updated on this branch.
 * Run: node scripts/check-docs.mjs
 */
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const DOCS = ['CLAUDE.md', 'ROADMAP.md', 'README.md']
const HEAD = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
const BRANCH = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()

console.log(`\nBranch: ${BRANCH}`)
console.log(`HEAD:   ${HEAD.slice(0, 8)}\n`)

const lastDocCommit = execSync(
  `git log -1 --format="%H %ci" -- ${DOCS.join(' ')}`,
  { encoding: 'utf8' }
).trim()

const lastCommit = execSync(
  `git log -1 --format="%H %ci"`,
  { encoding: 'utf8' }
).trim()

if (lastDocCommit === lastCommit) {
  console.log('✓ Docs up to date with HEAD.')
  process.exit(0)
}

console.log('⚠️  Docs may be out of date!\n')
console.log(`  Last doc change: ${lastDocCommit || 'never'}`)
console.log(`  Last commit:     ${lastCommit}\n`)

console.log('Recent commits without doc updates:')
const log = execSync(
  `git log --oneline --no-decorate ${lastDocCommit ? lastDocCommit.split(' ')[0] : '--all'}..HEAD -- . ':!CLAUDE.md' ':!ROADMAP.md' ':!README.md'`,
  { encoding: 'utf8' }
)
if (log.trim()) {
  for (const line of log.trim().split('\n').slice(0, 10)) {
    console.log(`  ${line}`)
  }
}
console.log('\n→ Run `npm run docs:check` again after updating docs.\n')
