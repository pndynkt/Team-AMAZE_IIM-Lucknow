import { marked } from 'marked'
import { DOCS, assetUrl, slugOf } from '@/content/docs'

const HASH_ROUTER = import.meta.env.VITE_ROUTER === 'hash'

/** An href for an in-app route that works with either router. Clicks are intercepted and routed anyway. */
export function routeHref(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const b = base.endsWith('/') ? base : `${base}/`
  return HASH_ROUTER ? `${b}#${path}` : `${b}${path.replace(/^\//, '')}`
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

/** "docs/screenshots/a.png", "./screenshots/a.png" or "architecture.png" to "docs/...". */
function publicPath(src: string): string {
  const clean = src.replace(/^\.\//, '').replace(/^\.\.\//, '').replace(/^docs\//, '')
  return `docs/${clean}`
}

/**
 * Markdown to HTML for the docs viewer. Headings get ids, images point at public/docs, links between
 * documents become viewer routes (data-route), repository-only paths become plain text.
 */
export function renderDoc(source: string): string {
  const html = marked.parse(source, { async: false, gfm: true }) as string
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')!
  root.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
    if (!h.id) h.id = slugify(h.textContent ?? '')
  })
  root.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? ''
    if (src && !/^(https?:|data:)/i.test(src)) img.setAttribute('src', assetUrl(publicPath(src)))
    img.setAttribute('loading', 'lazy')
    img.removeAttribute('width')
    if (!img.getAttribute('alt')) img.setAttribute('alt', '')
  })
  root.querySelectorAll('table').forEach((t) => {
    t.setAttribute('tabindex', '0')
    // Markdown key-value tables have an empty header row; drop it.
    const head = t.querySelector('thead')
    if (head && !(head.textContent ?? '').trim()) head.remove()
  })
  // Images open full size in a new tab.
  root.querySelectorAll('img').forEach((img) => {
    if (img.closest('a')) return
    const link = doc.createElement('a')
    link.href = img.getAttribute('src') ?? '#'
    link.target = '_blank'
    link.rel = 'noreferrer noopener'
    link.className = 'doc-figure'
    link.setAttribute('aria-label', `Open ${img.getAttribute('alt') || 'the image'} full size`)
    img.replaceWith(link)
    link.appendChild(img)
  })
  root.querySelectorAll('a[href]').forEach((a) => {
    if (a.classList.contains('doc-figure')) return
    const href = a.getAttribute('href') ?? ''
    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noreferrer noopener')
      return
    }
    if (href.startsWith('#')) {
      a.setAttribute('data-anchor', href.slice(1))
      return
    }
    const [path, hash] = href.split('#')
    const file = path.split('/').pop() ?? ''
    if (/\.md$/i.test(file)) {
      const slug = slugOf(file)
      if (DOCS.some((d) => d.slug === slug)) {
        const route = `/guide/docs/${slug}`
        a.setAttribute('href', routeHref(route))
        a.setAttribute('data-route', route)
        if (hash) a.setAttribute('data-anchor', hash)
        return
      }
    }
    if (/^license$/i.test(file)) {
      a.setAttribute('href', assetUrl('docs/LICENSE.txt'))
      return
    }
    if (/\.(pdf|png|svg|jpg|jpeg)$/i.test(file)) {
      a.setAttribute('href', assetUrl(publicPath(path)))
      a.setAttribute('target', '_blank')
      return
    }
    if (/screenshots\/?$/.test(path)) {
      a.setAttribute('href', routeHref('/guide'))
      a.setAttribute('data-route', '/guide')
      return
    }
    // A path that only exists in the repository: keep the words, drop the dead link.
    const span = doc.createElement('span')
    span.className = 'doc-path'
    span.title = href
    span.innerHTML = a.innerHTML
    a.replaceWith(span)
  })
  return root.innerHTML
}
