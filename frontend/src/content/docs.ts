// Markdown documents shown in the evaluator documents viewer (/guide/docs/:slug).
// Drop any *.md file into src/content/docs and it appears here; ORDER only sets the sequence.

const RAW = import.meta.glob('./docs/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export interface DocEntry {
  slug: string
  file: string
  title: string
  summary: string
  source: string
}

const ORDER = ['README', 'ALGORITHM', 'MODEL_CARD', 'API', 'DESIGN', 'DEVICE_SYNC', 'COMPLIANCE', 'DATA_SOURCES']

const NAMES: Record<string, { title: string; summary: string }> = {
  README: { title: 'Read me', summary: 'Team, problem, what is in the box, results and how to run it' },
  ALGORITHM: { title: 'How the algorithm works', summary: 'The five steps of the twin, worked on one patient' },
  MODEL_CARD: { title: 'Model card', summary: 'Data, metrics, ablations, calibration and limits' },
  API: { title: 'API contract', summary: 'Every endpoint the front end uses, with shapes' },
  DESIGN: { title: 'Design system', summary: 'Palette, type, layout and copy rules' },
  DEVICE_SYNC: { title: 'Device sync', summary: 'How real watches would connect, brand by brand' },
  COMPLIANCE: { title: 'Compliance', summary: 'DPDP, CDSCO, ICMR, TRAI and ABDM, mapped to screens' },
  DATA_SOURCES: { title: 'Data sources', summary: 'Synthetic data and the published work behind its parameters' },
}

/** "MODEL_CARD.md" to "model-card". */
export function slugOf(file: string): string {
  return file.replace(/\.md$/i, '').toLowerCase().replace(/_/g, '-')
}

export const DOCS: DocEntry[] = Object.entries(RAW)
  .map(([path, source]) => {
    const file = path.split('/').pop() ?? path
    const base = file.replace(/\.md$/i, '')
    const h1 = source.match(/^#\s+(.+)$/m)?.[1]?.trim()
    const named = NAMES[base]
    return { slug: slugOf(file), file, title: named?.title ?? h1 ?? base, summary: named?.summary ?? '', source }
  })
  .sort((a, b) => {
    const ia = ORDER.indexOf(a.file.replace(/\.md$/i, ''))
    const ib = ORDER.indexOf(b.file.replace(/\.md$/i, ''))
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.file.localeCompare(b.file)
  })

export function docBySlug(slug: string | undefined): DocEntry | undefined {
  return DOCS.find((d) => d.slug === slug)
}

/** Files in the repository that ship as public downloads (public/docs). */
export const DOWNLOADS = [
  { path: 'docs/presentation.pdf', label: 'Presentation', note: 'PDF' },
  { path: 'docs/algorithm.pdf', label: 'Algorithm, step by step', note: 'PDF' },
  { path: 'docs/architecture.pdf', label: 'Architecture diagram', note: 'PDF' },
  { path: 'docs/architecture.png', label: 'Architecture diagram', note: 'PNG' },
  { path: 'docs/LICENSE.txt', label: 'MIT licence', note: 'Text' },
]

/** Public asset URL that also works under a relative base (vite build --base ./). */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`
}
