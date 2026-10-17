// End-to-end smoke test of the mock-mode flows. Run with the dev server up (npm run dev:mock).
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const launchOpts = { headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) }
const browser = await chromium.launch(launchOpts)
const errors = []
let failures = 0
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}

async function newPage(vp, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL') && !m.text().includes('fonts.g')) errors.push(`console: ${m.text()}`)
  })
  return { ctx, page }
}

// 1. Alerts page: ack, snooze, escalate
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 })
  await page.goto(`${BASE}/console/settings`, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/console/alerts`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const row = page.getByRole('button', { name: /Strain episode risk 71%/ }).first()
  await row.getByRole('button', { name: 'Ack' }).click()
  await page.waitForTimeout(700)
  check('ack toast', await page.getByText('AL-0231 acknowledged').count() > 0)
  await row.getByRole('button', { name: 'Snooze 3 h' }).click()
  await page.waitForTimeout(700)
  check('snooze toast', await page.getByText('AL-0231 snoozed for 3 h').count() > 0)
  const row2 = page.getByRole('button', { name: /NightSignal red/ }).first()
  await row2.getByRole('button', { name: 'Escalate' }).click()
  await page.waitForTimeout(900)
  check('escalate toast', await page.getByText(/Escalation ES-00\d+ started/).count() > 0)
  await page.waitForTimeout(2500)
  check('banner shows 2 escalations', await page.getByText('2 escalations in progress').count() > 0)
  // resolve via the patient alerts tab
  await page.goto(`${BASE}/console/patients/P-0042?tab=alerts`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  check('ladder visible on patient alerts tab', await page.getByText('Escalation live view').count() > 0)
  await page.getByRole('button', { name: 'False alarm' }).first().click()
  await page.waitForTimeout(900)
  check('false alarm toast', await page.getByText(/closed as false alarm/).count() > 0)
  await ctx.close()
}

// 2. Thresholds apply
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 })
  await page.goto(`${BASE}/console/thresholds`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.locator('#th-urgent').focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(700)
  check('preview updates', await page.getByText('was 60').count() > 0)
  await page.getByRole('button', { name: 'Apply draft' }).click()
  await page.waitForTimeout(800)
  check('apply toast', await page.getByText('Thresholds applied').count() > 0)
  await page.goto(`${BASE}/console/audit`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  check('audit has thresholds.updated', await page.getByText('thresholds.updated').count() > 0)
  await ctx.close()
}

// 3. Twin tab: add note, scrubber, live ticker
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 })
  await page.goto(`${BASE}/console/patients/P-0007?tab=twin`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.getByRole('tab', { name: '120 days' }).click()
  await page.waitForTimeout(900)
  check('120-day timeline renders', (await page.locator('.recharts-surface').count()) >= 3)
  await page.getByRole('button', { name: 'Add note' }).click()
  await page.fill('#note-text', 'Smoke test note')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForTimeout(900)
  check('note saved toast', await page.getByText('Note added').count() > 0)
  check('note in rail', await page.getByText('Smoke test note').count() > 0)
  await page.waitForTimeout(2500)
  check('live ticker has a sample', await page.getByText('one 5-minute sample per tick').count() > 0 && (await page.getByText(/^at \d\d:\d\d$/).count()) > 0)
  await ctx.close()
}

// 4. Patient view: check-in, log, consent, SOS
{
  const { ctx, page } = await newPage({ width: 430, height: 932 }, true)
  await page.goto(`${BASE}/me/P-0007`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.getByRole('radio', { name: 'Tired' }).click()
  await page.getByRole('button', { name: 'Send' }).click()
  await page.waitForTimeout(800)
  check('check-in thank-you with alert', await page.getByText('We have let your doctor know').count() > 0)
  await page.getByRole('button', { name: 'Symptom' }).click()
  await page.fill('#log-label', 'Headache after lunch')
  await page.getByRole('button', { name: 'Send' }).click()
  await page.waitForTimeout(800)
  check('log saved', await page.getByText(/Logged for today/).count() > 0)
  await page.getByRole('button', { name: 'Privacy and consent' }).click()
  await page.waitForTimeout(800)
  await page.getByRole('switch', { name: /AI predictions/ }).click()
  await page.waitForTimeout(900)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(900)
  check('score hidden after opting out', await page.getByText('Predictions off').count() > 0)
  await page.getByRole('button', { name: 'Privacy and consent' }).click()
  await page.waitForTimeout(600)
  await page.getByRole('switch', { name: /AI predictions/ }).click()
  await page.waitForTimeout(600)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
  // SOS
  const btn = page.getByRole('button', { name: /SOS/ })
  await btn.scrollIntoViewIfNeeded()
  const box = await btn.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1700)
  await page.mouse.up()
  await page.waitForTimeout(500)
  check('countdown shown', await page.getByText('Are you OK?').count() > 0)
  await page.waitForTimeout(9500)
  check('ladder shown', await page.getByText('Reaching your contacts').count() > 0)
  await page.getByRole('button', { name: "I'm OK" }).click()
  await page.waitForTimeout(900)
  check("I'm OK resolves", await page.getByText('You said you are OK').count() > 0)

  // 5. Same browser, second tab: the clinician sees the check-in alert and the SOS record
  const page2 = await ctx.newPage()
  await page2.setViewportSize({ width: 1440, height: 900 })
  await page2.goto(`${BASE}/console/alerts`, { waitUntil: 'networkidle' })
  await page2.waitForTimeout(800)
  check('check-in alert visible to clinician in another tab', await page2.getByText('Check-in: tired').count() > 0)
  check('SOS alert visible to clinician in another tab', await page2.getByText('SOS pressed by patient').count() > 0)
  await ctx.close()
}

await browser.close()
console.log(`\n${failures} failures, ${errors.length} console errors`)
for (const e of errors.slice(0, 10)) console.log('  ', e)
process.exit(failures || errors.length ? 1 : 0)
