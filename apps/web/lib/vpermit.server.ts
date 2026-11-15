// Server-only vPermit client. Drives the public claimable-event form in a real
// (headless) Chrome because the site validates a reCAPTCHA v3 token that a plain
// HTTP POST cannot produce.
//
// The stealth setup is load-bearing: the same flow is rejected when
// `navigator.webdriver` is visible, and passes with it hidden plus human-paced
// typing. Do not "simplify" it without re-running the live test.
//
// Never call this from a client component.

import fs from 'node:fs'
import { chromium } from 'playwright-core'
import { isValidPlate, normalisePlate } from './parking'
import {
  parseVpermitClaimUrl,
  parseVpermitConfirmation,
  type FtpClaimStatus,
} from './vpermit'

const DEFAULT_TIMEOUT_MS = 75_000
const NAV_TIMEOUT_MS = 60_000
const VPERMIT_TIMEZONE = 'Pacific/Auckland'

export interface VpermitClaimArgs {
  claimUrl: string
  contactName?: string | null
  contactEmail?: string | null
  plate: string
  timeoutMs?: number
}

export interface VpermitClaimResult {
  status: FtpClaimStatus
  ok: boolean
  message: string
  validFrom: string | null
  validUntil: string | null
  locations: string[]
  confirmationText: string | null
  html: string | null
  screenshot: Buffer | null
  httpStatus: number | null
  durationMs: number
}

export interface VpermitBrowserCheckResult {
  ok: boolean
  httpStatus: number | null
  message: string
  durationMs: number
}

function browserCandidates(): string[] {
  const candidates = [
    process.env.FTP_BROWSER_PATH,
    process.env.CHROMIUM_PATH,
    process.platform === 'win32'
      ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
      : null,
    process.platform === 'win32'
      ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      : null,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ]
  return candidates.filter((value): value is string => Boolean(value))
}

export function vpermitBrowserPath(): string | null {
  return browserCandidates().find((candidate) => fs.existsSync(candidate)) ?? null
}

function userAgentFor(version: string): string {
  const platform =
    process.platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : process.platform === 'darwin'
        ? 'Macintosh; Intel Mac OS X 10_15_7'
        : 'X11; Linux x86_64'
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`
}

// One browser at a time. Kiosk volume is low and this keeps memory bounded.
let queue: Promise<unknown> = Promise.resolve()

function serialise<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)
  queue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function typeLikeHuman(
  page: import('playwright-core').Page,
  selector: string,
  value: string,
  delay = 60,
): Promise<void> {
  const input = page.locator(selector)
  await input.click()
  await input.fill('')
  if (value) await input.pressSequentially(value, { delay })
}

function failure(
  message: string,
  durationMs: number,
  extra?: Partial<VpermitClaimResult>,
): VpermitClaimResult {
  return {
    status: 'FAILED',
    ok: false,
    message,
    validFrom: null,
    validUntil: null,
    locations: [],
    confirmationText: null,
    html: null,
    screenshot: null,
    httpStatus: null,
    durationMs,
    ...extra,
  }
}

/**
 * Claim a 4-hour session. Returns the parsed vendor confirmation plus the raw
 * HTML/screenshot for the evidence log. The call is serialised.
 */
export function claimWithVpermit(args: VpermitClaimArgs): Promise<VpermitClaimResult> {
  return serialise(async () => {
    const started = Date.now()
    const parsedUrl = parseVpermitClaimUrl(args.claimUrl)
    if (!parsedUrl.ok) {
      return failure(parsedUrl.error, Date.now() - started)
    }
    const plate = normalisePlate(args.plate)
    if (!isValidPlate(plate)) {
      return failure('INVALID NUMBER PLATE', Date.now() - started)
    }
    const executablePath = vpermitBrowserPath()
    if (!executablePath) {
      return failure(
        'AUTOMATIC PARKING IS NOT AVAILABLE ON THIS SERVER — USE THE PARKING PAGE',
        Date.now() - started,
      )
    }

    const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS
    let browser: import('playwright-core').Browser | null = null
    let page: import('playwright-core').Page | null = null
    const dialogs: string[] = []

    try {
      browser = await chromium.launch({
        executablePath,
        headless: true,
        timeout: timeoutMs,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
        ],
      })
      const context = await browser.newContext({
        locale: 'en-NZ',
        timezoneId: VPERMIT_TIMEZONE,
        viewport: { width: 1280, height: 900 },
        userAgent: userAgentFor(browser.version()),
        colorScheme: 'light',
      })
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
        const w = window as unknown as { chrome?: unknown }
        w.chrome = w.chrome || { runtime: {} }
        Object.defineProperty(navigator, 'languages', { get: () => ['en-NZ', 'en'] })
      })
      page = await context.newPage()
      page.on('dialog', (dialog) => {
        dialogs.push(dialog.message())
        void dialog.dismiss().catch(() => undefined)
      })

      const response = await page.goto(parsedUrl.value.url, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      })
      await page.locator('input[name="Name"]').waitFor({ state: 'visible', timeout: 20_000 })

      await typeLikeHuman(page, 'input[name="Name"]', args.contactName ?? '')
      await typeLikeHuman(page, 'input[name="Email"]', args.contactEmail ?? '')
      await typeLikeHuman(page, 'input[name="Rego"]', plate, 70)
      await page.waitForTimeout(500)

      await page.getByRole('button', { name: /Start Session/i }).first().click()
      await page.locator('#myModal').waitFor({ state: 'visible', timeout: 15_000 })
      await page.waitForTimeout(400)
      await page.locator('#dddd').check()
      await page.waitForTimeout(800)

      const start = page.locator('#myModal .modal-footer button.btn-primary')
      await start.waitFor({ state: 'visible', timeout: 10_000 })
      const enabled = await start.isEnabled()
      if (!enabled) {
        return failure('THE PARKING FORM DID NOT BECOME READY', Date.now() - started)
      }

      let httpStatus: number | null = response?.status() ?? null
      let navigated = false
      try {
        const [nav] = await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }),
          start.click(),
        ])
        httpStatus = nav?.status() ?? httpStatus
        navigated = true
      } catch {
        // A reCAPTCHA failure shows an alert and does not navigate.
      }

      await page.waitForTimeout(navigated ? 800 : 1500)
      const html = await page.content().catch(() => null)
      const screenshot = await page
        .screenshot({ fullPage: true, type: 'png' })
        .catch(() => null)
      const parsed = html
        ? parseVpermitConfirmation(html)
        : {
            status: 'FAILED' as FtpClaimStatus,
            ok: false,
            message: dialogs.length ? dialogs.join(' · ') : 'NO RESPONSE FROM THE PARKING SITE',
            validFrom: null,
            validUntil: null,
            locations: [],
            text: '',
          }

      const captchaDialog = dialogs.some((message) => /captcha/i.test(message))
      const status =
        parsed.status === 'FAILED' && captchaDialog ? 'CAPTCHA_BLOCKED' : parsed.status
      const message =
        parsed.status === 'FAILED' && captchaDialog
          ? 'THE PARKING SITE BLOCKED THE AUTOMATIC START'
          : parsed.message

      return {
        status,
        ok: parsed.ok,
        message,
        validFrom: parsed.validFrom,
        validUntil: parsed.validUntil,
        locations: parsed.locations,
        confirmationText: parsed.text ? parsed.text.slice(0, 5_000) : null,
        html,
        screenshot,
        httpStatus,
        durationMs: Date.now() - started,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'THE PARKING BROWSER FAILED'
      const html = page ? await page.content().catch(() => null) : null
      const screenshot = page
        ? await page.screenshot({ fullPage: true, type: 'png' }).catch(() => null)
        : null
      const captcha = dialogs.some((dialog) => /captcha/i.test(dialog)) || /captcha/i.test(message)
      return failure(captcha ? 'THE PARKING SITE BLOCKED THE AUTOMATIC START' : message, Date.now() - started, {
        status: captcha ? 'CAPTCHA_BLOCKED' : 'FAILED',
        html,
        screenshot,
      })
    } finally {
      await browser?.close().catch(() => undefined)
    }
  })
}

/**
 * Browser readiness check: loads the claim page, confirms the form, antiforgery
 * token and reCAPTCHA script are present. Does not submit, so it uses no slot.
 */
export function checkVpermitBrowser(args: {
  claimUrl: string
  timeoutMs?: number
}): Promise<VpermitBrowserCheckResult> {
  return serialise(async () => {
    const started = Date.now()
    const parsedUrl = parseVpermitClaimUrl(args.claimUrl)
    if (!parsedUrl.ok) {
      return { ok: false, httpStatus: null, message: parsedUrl.error, durationMs: Date.now() - started }
    }
    const executablePath = vpermitBrowserPath()
    if (!executablePath) {
      return {
        ok: false,
        httpStatus: null,
        message: 'AUTOMATIC PARKING BROWSER IS NOT INSTALLED',
        durationMs: Date.now() - started,
      }
    }
    const timeoutMs = args.timeoutMs ?? 45_000
    let browser: import('playwright-core').Browser | null = null
    try {
      browser = await chromium.launch({
        executablePath,
        headless: true,
        timeout: timeoutMs,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
        ],
      })
      const context = await browser.newContext({
        locale: 'en-NZ',
        timezoneId: VPERMIT_TIMEZONE,
        viewport: { width: 1280, height: 900 },
        userAgent: userAgentFor(browser.version()),
      })
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
        const w = window as unknown as { chrome?: unknown }
        w.chrome = w.chrome || { runtime: {} }
        Object.defineProperty(navigator, 'languages', { get: () => ['en-NZ', 'en'] })
      })
      const page = await context.newPage()
      const response = await page.goto(parsedUrl.value.url, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      })
      const status = response?.status() ?? null
      const name = await page.locator('input[name="Name"]').count()
      const rego = await page.locator('input[name="Rego"]').count()
      const token = await page.locator('input[name="__RequestVerificationToken"]').count()
      let recaptcha = false
      try {
        await page.waitForFunction(
          () => typeof (window as unknown as { grecaptcha?: unknown }).grecaptcha !== 'undefined',
          null,
          { timeout: 10_000 },
        )
        recaptcha = true
      } catch {
        recaptcha = false
      }
      const ok = status === 200 && name > 0 && rego > 0 && token > 0 && recaptcha
      return {
        ok,
        httpStatus: status,
        message: ok
          ? 'CLAIM FORM READY'
          : !status || status !== 200
            ? `CLAIM PAGE RETURNED ${status ?? 'NO RESPONSE'}`
            : 'CLAIM FORM CHANGED — CHECK THE FIELDS',
        durationMs: Date.now() - started,
      }
    } catch (error) {
      return {
        ok: false,
        httpStatus: null,
        message: error instanceof Error ? error.message : 'THE PARKING BROWSER FAILED',
        durationMs: Date.now() - started,
      }
    } finally {
      await browser?.close().catch(() => undefined)
    }
  })
}
