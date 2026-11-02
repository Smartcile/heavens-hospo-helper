import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

function arg(name, fallback) {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1]
}

function hasFlag(name) {
  return process.argv.includes(name)
}

const url = arg("--url")
const out = arg("--out")
const role = arg("--role", "public")
const email = arg("--email", "")
const password = arg("--password", "")
const mobile = hasFlag("--mobile")
const fullPage = hasFlag("--full-page")
const click = arg("--click", "")
const waitFor = arg("--wait-for", "")
const waitMs = Number(arg("--wait-ms", "1500"))
const width = Number(arg("--width", mobile ? "390" : "1280"))
const height = Number(arg("--height", mobile ? "844" : "900"))

if (!url || !out) {
  throw new Error("Usage: node screenshot.mjs --url <url> --out <file> [--role public|admin|worker]")
}

const browserCandidates = [
  arg("--browser", ""),
  process.env.SCREENSHOT_BROWSER,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean)

const executablePath = browserCandidates.find((candidate) => fs.existsSync(candidate))
if (!executablePath) {
  throw new Error("No Chrome or Edge browser found. Set SCREENSHOT_BROWSER to the browser executable.")
}

fs.mkdirSync(path.dirname(out), { recursive: true })

const parsed = new URL(url)
const baseUrl = `${parsed.protocol}//${parsed.host}`

const browser = await chromium.launch({ executablePath, headless: true })

try {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: mobile,
    hasTouch: mobile,
  })
  const page = await context.newPage()

  if (role === "admin" || role === "worker") {
    if (!email || !password) {
      throw new Error(`${role} screenshots need --email and --password, or AGENT_SCREENSHOT_EMAIL/PASSWORD.`)
    }

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: /ADMIN LOGIN/i }).click()
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('button[type="submit"]').click()

    try {
      await page.waitForURL(/\/admin(\/|$|\?)/, { timeout: 20000 })
    } catch {
      throw new Error("Admin login failed. Check AGENT_SCREENSHOT_EMAIL/PASSWORD and that the account exists.")
    }

    if (role === "worker") {
      const switched = await page.evaluate(async () => {
        const response = await fetch("/api/worker/switch", { method: "POST" })
        return { ok: response.ok, status: response.status }
      })
      if (!switched.ok) {
        throw new Error(`Worker switch failed with HTTP ${switched.status}.`)
      }
    }
  }

  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(waitMs)

  if (waitFor) {
    await page.waitForSelector(waitFor, { timeout: 15000 })
  }

  if (click) {
    await page.click(click)
    await page.waitForTimeout(waitMs)
  }

  await page.screenshot({ path: out, fullPage })
  console.log(JSON.stringify({ path: out, url, role, width, height, mobile }))
} finally {
  await browser.close()
}
