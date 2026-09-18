// Captures desktop + mobile screenshots of the BEO / events area.
//
// The app must be running (start.ps1 or docker compose) and seeded. Playwright
// is not a dependency of this repo — install it once:
//
//   npm i -D playwright
//   npx playwright install chromium
//
// Then, with the app up:
//
//   node scripts/capture-beo-screenshots.mjs
//
// Environment (all optional):
//   BASE_URL        default http://localhost:3000
//   ADMIN_EMAIL     default admin@demo.com
//   ADMIN_PASSWORD  default admin1234
//   WORKER_PIN      e.g. 0000 — adds the /w/events (phone) captures
//   SHARE_TOKEN     the token from an event's SHARE modal — adds /e/<token>
//
// Output: screenshots/desktop/*.png and screenshots/mobile/*.png

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../screenshots')

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@demo.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin1234'
const WORKER_PIN = process.env.WORKER_PIN ?? ''
const SHARE_TOKEN = process.env.SHARE_TOKEN ?? ''

const DEVICES = [
  {
    label: 'desktop',
    context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  },
  {
    label: 'mobile',
    context: {
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    },
  },
]

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  console.error(
    '\nPlaywright is not installed.\n\n  npm i -D playwright\n  npx playwright install chromium\n',
  )
  process.exit(1)
}

async function shoot(page, label, name) {
  const dir = resolve(OUT, label)
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: resolve(dir, `${name}.png`) })
  console.log(`  ${label}/${name}.png`)
}

async function adminLogin(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', ADMIN_EMAIL)
  await page.fill('input[type="password"]', ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'SIGN IN' }).click()
  await page.waitForURL('**/admin**', { timeout: 20000 })
}

async function captureAdmin(context, label) {
  const page = await context.newPage()
  await adminLogin(page)

  await page.goto(`${BASE}/admin/events`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="event-card"]', { timeout: 15000 })
  await shoot(page, label, 'beo-events-list')

  await page.getByRole('button', { name: '+ NEW EVENT' }).click()
  await page.waitForTimeout(500)
  await shoot(page, label, 'beo-new-event-modal')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  await page.locator('[data-testid="event-card"]').first().click()
  await page.waitForSelector('[data-testid="beo-builder"]', { timeout: 15000 })
  await page.waitForTimeout(700)
  await shoot(page, label, 'beo-builder-top')

  await page.mouse.wheel(0, 1400)
  await page.waitForTimeout(500)
  await shoot(page, label, 'beo-builder-blocks')

  await page.goto(`${BASE}/admin/events?tab=templates`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await shoot(page, label, 'beo-templates')

  await page.goto(`${BASE}/admin/events?tab=requests`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await shoot(page, label, 'beo-requests')

  await page.close()
}

async function captureWorker(browser, label, contextOptions) {
  if (!WORKER_PIN) return
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  try {
    await page.goto(`${BASE}/w/login`, { waitUntil: 'networkidle' })
    await page.locator('button', { hasText: 'TAP TO ENTER PIN' }).first().click()
    await page.waitForURL('**/w/login?venue=**', { timeout: 15000 })

    for (const digit of WORKER_PIN) {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }
    await page.getByRole('button', { name: 'SIGN IN' }).click()
    await page.waitForURL('**/w/dashboard**', { timeout: 20000 })

    await page.goto(`${BASE}/w/events`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    await shoot(page, label, 'worker-events-list')

    const card = page.locator('button', { hasText: 'PAX' }).first()
    if (await card.count()) {
      await card.click()
      await page.waitForTimeout(800)
      await shoot(page, label, 'worker-event-editor')
    }
  } catch (err) {
    console.error(`  worker capture skipped: ${err.message}`)
  }
  await context.close()
}

async function captureShare(browser, label, contextOptions) {
  if (!SHARE_TOKEN) return
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  try {
    await page.goto(`${BASE}/e/${SHARE_TOKEN}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    await shoot(page, label, 'share-page-top')
    await page.mouse.wheel(0, 1600)
    await page.waitForTimeout(500)
    await shoot(page, label, 'share-page-requests')
  } catch (err) {
    console.error(`  share capture skipped: ${err.message}`)
  }
  await context.close()
}

const browser = await chromium.launch()

for (const device of DEVICES) {
  console.log(`\n${device.label.toUpperCase()} (${device.context.viewport.width}x${device.context.viewport.height})`)

  const context = await browser.newContext(device.context)
  try {
    await captureAdmin(context, device.label)
  } catch (err) {
    console.error(`  admin capture failed: ${err.message}`)
  }
  await context.close()

  await captureWorker(browser, device.label, device.context)
  await captureShare(browser, device.label, device.context)
}

await browser.close()
console.log(`\nDone — screenshots in ${OUT}`)
