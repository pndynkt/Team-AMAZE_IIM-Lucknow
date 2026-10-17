// Screenshots of every route (the set in docs/screenshots comes from here).
// Start a dev server first (npm run dev:mock, or npm run preview after npm run build:demo), then:
//   node scripts/screenshots.mjs        (needs: npm i --no-save playwright)
// Env: BASE (default http://localhost:5173), ONLY (comma list of names), OUT (output folder),
//      CHROME (optional Chromium executable).

import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = process.env.OUT ?? join(__dirname, '..', 'screenshots')
mkdirSync(OUT, { recursive: true })
const BASE = process.env.BASE ?? 'http://localhost:5173'
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null
const CHROME = process.env.CHROME

const DESKTOP = { width: 1440, height: 900 }
const LAPTOP = { width: 1280, height: 800 }
const PHONE = { width: 390, height: 844 }
const PATIENT = { width: 430, height: 932 }

const holdSos = async (page) => {
  const btn = page.getByRole('button', { name: /^SOS/ })
  await btn.scrollIntoViewIfNeeded()
  const box = await btn.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1700)
  await page.mouse.up()
}

const routes = [
  { name: 'landing-1440', path: '/', vp: DESKTOP, full: true, settle: 3200 },
  { name: 'landing-1440-hero', path: '/', vp: DESKTOP, settle: 3200 },
  { name: 'landing-390', path: '/', vp: PHONE, full: true, mobile: true, settle: 3200 },
  { name: 'console-triage-1440', path: '/console', vp: DESKTOP, full: true },
  { name: 'console-triage-1280', path: '/console', vp: LAPTOP },
  { name: 'console-triage-more-columns', path: '/console', vp: DESKTOP, before: async (p) => { await p.getByRole('button', { name: 'More columns' }).click(); await p.waitForTimeout(300) } },
  { name: 'console-triage-dark', path: '/console', vp: DESKTOP, init: () => { try { localStorage.setItem('pratibimb-theme', 'dark') } catch {} } },
  { name: 'console-twin-overview', path: '/console/patients/P-0007', vp: DESKTOP, full: true, settle: 1800 },
  { name: 'console-twin-overview-1280', path: '/console/patients/P-0007', vp: LAPTOP, settle: 1800 },
  { name: 'console-twin-charts', path: '/console/patients/P-0007?tab=twin', vp: DESKTOP, full: true, settle: 3000 },
  { name: 'console-twin-simulate', path: '/console/patients/P-0007?tab=simulate', vp: DESKTOP, full: true, settle: 1800 },
  { name: 'console-twin-records', path: '/console/patients/P-0007?tab=records', vp: DESKTOP, full: true },
  { name: 'console-twin-alerts', path: '/console/patients/P-0007?tab=alerts', vp: DESKTOP, full: true },
  { name: 'console-escalation-live', path: '/console/patients/P-0019?tab=alerts', vp: DESKTOP, full: true, settle: 2500, before: async (p) => { const b = p.getByRole('button', { name: /Show the \d messages/ }).first(); if (await b.count()) await b.click(); await p.waitForTimeout(500) } },
  { name: 'console-alerts', path: '/console/alerts', vp: DESKTOP, full: true },
  { name: 'console-alerts-why', path: '/console/alerts', vp: DESKTOP, before: async (p) => { await p.getByRole('button', { name: 'Why this alert' }).first().click(); await p.waitForTimeout(900) } },
  { name: 'console-thresholds', path: '/console/thresholds', vp: DESKTOP, full: true, before: async (p) => { const s = p.locator('#th-urgent'); await s.focus(); for (let i = 0; i < 6; i++) await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900) } },
  { name: 'console-model', path: '/console/model', vp: DESKTOP, full: true },
  { name: 'console-audit', path: '/console/audit', vp: DESKTOP, full: true },
  { name: 'console-settings', path: '/console/settings', vp: DESKTOP },
  { name: 'me-430', path: '/me/P-0007', vp: PATIENT, mobile: true, settle: 1800 },
  { name: 'me-430-full', path: '/me/P-0007', vp: PATIENT, mobile: true, full: true, inner: true, settle: 1800 },
  { name: 'me-430-hindi', path: '/me/P-0007', vp: PATIENT, mobile: true, full: true, inner: true, settle: 1200, before: async (p) => { await p.getByRole('tab', { name: 'हिन्दी' }).click(); await p.waitForTimeout(500) } },
  { name: 'me-390', path: '/me/P-0007', vp: PHONE, mobile: true, settle: 1800 },
  { name: 'me-desktop', path: '/me/P-0007', vp: DESKTOP, settle: 1800 },
  { name: 'me-calibrating', path: '/me/P-0240', vp: PATIENT, mobile: true, full: true, inner: true, settle: 1500 },
  { name: 'me-sos-countdown', path: '/me/P-0007', vp: PATIENT, mobile: true, before: async (p) => { await holdSos(p); await p.waitForTimeout(1200) } },
  { name: 'me-sos-ladder', path: '/me/P-0007', vp: PATIENT, mobile: true, before: async (p) => { await holdSos(p); await p.waitForTimeout(9000) } },
  { name: 'console-banner-after-sos', path: '/console', vp: DESKTOP, settle: 2500 },
  { name: 'guide-1440', path: '/guide', vp: DESKTOP, full: true },
  { name: 'guide-390', path: '/guide', vp: PHONE, mobile: true, full: true },
  { name: 'docs-readme', path: '/guide/docs/readme', vp: DESKTOP, full: true },
  { name: 'docs-model-card', path: '/guide/docs/model-card', vp: DESKTOP, full: true },
  { name: 'docs-390', path: '/guide/docs/model-card', vp: PHONE, mobile: true },
  { name: 'not-found', path: '/nowhere', vp: DESKTOP },
]

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
// One context for the SOS sequence so the console sees the escalation the patient view started.
const shared = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 })
let failures = 0
for (const r of routes) {
  if (ONLY && !ONLY.includes(r.name)) continue
  const ctx = r.init ? await browser.newContext({ viewport: r.vp, deviceScaleFactor: 1, isMobile: !!r.mobile, hasTouch: !!r.mobile }) : r.mobile ? await browser.newContext({ viewport: r.vp, deviceScaleFactor: 1, isMobile: true, hasTouch: true }) : shared
  if (r.init) await ctx.addInitScript(r.init)
  const page = await ctx.newPage()
  if (!r.init && !r.mobile) await page.setViewportSize(r.vp)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  try {
    // The live stream keeps a connection open, so network idle may never come: wait for load, then idle briefly.
    await page.goto(BASE + r.path, { waitUntil: 'load' })
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(r.settle ?? 1200)
    if (r.before) await r.before(page)
    if (r.inner) {
      // The patient view scrolls inside its frame: grow the page to the content height.
      const h = await page.evaluate(() => {
        const el = document.querySelector('.overflow-y-auto')
        return el ? el.scrollHeight + 40 : document.body.scrollHeight
      })
      await page.setViewportSize({ width: r.vp.width, height: Math.min(6000, h) })
      await page.waitForTimeout(500)
    }
    await page.screenshot({ path: join(OUT, `${r.name}.png`), fullPage: !!r.full })
    console.log(`ok   ${r.name}${errors.length ? `  (${errors.length} console errors: ${errors.slice(0, 2).join(' | ').slice(0, 220)})` : ''}`)
  } catch (e) {
    failures++
    console.log(`FAIL ${r.name}: ${e.message.split('\n')[0]}`)
  }
  await page.close()
  if (ctx !== shared) await ctx.close()
}
await browser.close()
process.exit(failures ? 1 : 0)
