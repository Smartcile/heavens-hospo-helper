#!/usr/bin/env node
// Generates `apps/web/content/release-updates.json` from GitHub issues so the
// admin Update Verification page works with no runtime token or internet.
// Run locally (`npm run sync:updates`) before a verification round, review the
// JSON diff, and commit it. Production never calls GitHub.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const versionPath = join(root, 'apps/web/version.json')
const outPath = join(root, 'apps/web/content/release-updates.json')

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

function readBuild() {
  try {
    const version = JSON.parse(readFileSync(versionPath, 'utf8'))
    const build = Number(version.build)
    if (Number.isFinite(build) && build > 0) return String(build)
  } catch {
    // fall through to a timestamp version
  }
  return null
}

const generatedAt = new Date().toISOString()
const version = readBuild() ?? generatedAt.slice(0, 19).replace(/[-:T]/g, '')

let repo = ''
try {
  repo = gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim()
} catch {
  // Not fatal — the page only uses this for a label.
}

const raw = gh([
  'issue',
  'list',
  '--state',
  'all',
  '--limit',
  '500',
  '--json',
  'number,title,state,labels,url,closedAt',
])

const issues = JSON.parse(raw)
  .map((row) => ({
    number: row.number,
    title: row.title,
    state: row.state === 'OPEN' ? 'OPEN' : 'CLOSED',
    url: row.url,
    closedAt: row.closedAt ?? null,
    labels: (row.labels ?? [])
      .map((label) => (typeof label === 'string' ? label : label.name))
      .filter(Boolean),
  }))
  .filter((row) => Number.isInteger(row.number) && row.number > 0 && row.title)
  .sort((a, b) => a.number - b.number)

writeFileSync(
  outPath,
  `${JSON.stringify({ version, generatedAt, repo, issues }, null, 2)}\n`,
  'utf8',
)

console.log(`Wrote ${issues.length} issues to ${outPath}`)
console.log(`Version ${version}${repo ? ` · ${repo}` : ''}`)
