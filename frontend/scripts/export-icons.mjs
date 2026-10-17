// Export the app icon, favicon and apple-touch-icon from the AppIcon component, so public/
// always matches src/brand. Start the dev server first (npm run dev:mock), then run from
// frontend/: node scripts/export-icons.mjs   (needs: npm i --no-save playwright)
// Env: BASE (default http://localhost:5173), CHROME (optional Chromium executable).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(__dirname, '..', 'public')
const OUT = join(__dirname, '..', 'screenshots')
mkdirSync(OUT, { recursive: true })
const BASE = process.env.BASE ?? 'http://localhost:5173'

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})
const page = await browser.newPage()
await page.goto(`${BASE}/brand`, { waitUntil: 'networkidle' })

const grab = (key) => page.$eval(`[data-export="${key}"] svg`, (el) => el.outerHTML)

/** Make the React markup a tidy standalone file: short ids, no app classes, a title for accessibility. */
function clean(svg, { size, title = 'Pratibimb' }) {
  const ids = [...new Set([...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))]
  ids.forEach((id, i) => {
    const short = `p${i.toString(36)}`
    svg = svg.split(`id="${id}"`).join(`id="${short}"`).split(`url(#${id})`).join(`url(#${short})`)
  })
  svg = svg
    .replace(/\sclass="[^"]*"/g, '')
    .replace(/\srole="img"/, '')
    .replace(/\saria-label="[^"]*"/, '')
    .replace(/\saria-hidden="[^"]*"/g, '')
    .replace(/<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="\d+" height="\d+"/, size ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"` : '<svg xmlns="http://www.w3.org/2000/svg"')
  // title right after the root tag
  svg = svg.replace(/^(<svg[^>]*>)/, `$1<title>${title}</title>`)
  return svg + '\n'
}

const appIcon = clean(await grab('app-icon'), { size: 180 })
const favicon = clean(await grab('favicon'), { size: null })
const square = clean(await grab('app-icon-square'), { size: 180 })
writeFileSync(join(PUBLIC, 'app-icon.svg'), appIcon)
writeFileSync(join(PUBLIC, 'favicon.svg'), favicon)
console.log('wrote public/app-icon.svg', appIcon.length, 'bytes')
console.log('wrote public/favicon.svg', favicon.length, 'bytes')

// apple-touch-icon: full-bleed square, the platform applies its own rounded mask
const png = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 })
await png.setContent(`<!doctype html><html><body style="margin:0;background:#10302F">${square}</body></html>`)
await png.screenshot({ path: join(PUBLIC, 'apple-touch-icon.png'), clip: { x: 0, y: 0, width: 180, height: 180 } })
console.log('wrote public/apple-touch-icon.png')

// check the exported files render on their own, at the sizes that matter
const check = await browser.newPage({ viewport: { width: 520, height: 230 }, deviceScaleFactor: 2 })
const fav = favicon.replace('<svg xmlns="http://www.w3.org/2000/svg"', '<svg xmlns="http://www.w3.org/2000/svg" width="SIZE" height="SIZE"')
await check.setContent(`<!doctype html><html><body style="margin:0;padding:20px;background:#F1F6F5;display:flex;gap:20px;align-items:flex-end">
  ${appIcon}
  <img src="data:image/png;base64,${(await import('node:fs')).readFileSync(join(PUBLIC, 'apple-touch-icon.png')).toString('base64')}" width="120" height="120" style="border-radius:27px">
  ${fav.replaceAll('SIZE', '32')}
  ${fav.replaceAll('SIZE', '16')}
  <div style="background:#0E1A1A;padding:8px;border-radius:8px;display:flex;gap:8px">${fav.replaceAll('SIZE', '32')}${fav.replaceAll('SIZE', '16')}</div>
</body></html>`)
await check.screenshot({ path: join(OUT, 'icons-exported.png') })
console.log('wrote screenshots/icons-exported.png')

await browser.close()
