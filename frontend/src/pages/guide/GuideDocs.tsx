import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Download } from 'lucide-react'
import { DOCS, DOWNLOADS, assetUrl, docBySlug } from '@/content/docs'
import { SiteFooter, SiteHeader } from '@/components/layout/Site'
import { cn } from '@/lib/cn'
import { renderDoc } from './markdown'

export default function GuideDocs() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const doc = docBySlug(slug) ?? DOCS[0]
  const html = useMemo(() => (doc ? renderDoc(doc.source) : ''), [doc])

  useEffect(() => {
    document.title = doc ? `${doc.title}, Pratibimb documents` : 'Pratibimb documents'
    window.scrollTo({ top: 0 })
  }, [doc])

  // Route clicks on links between documents through the router; scroll to in-page anchors.
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return
    const route = a.getAttribute('data-route')
    const anchor = a.getAttribute('data-anchor')
    if (route) {
      e.preventDefault()
      navigate(route)
      if (anchor) window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }), 60)
    } else if (anchor) {
      e.preventDefault()
      document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  if (!doc) return null
  return (
    <div className="min-h-screen bg-mist text-ink">
      <SiteHeader />
      <div className="mx-auto max-w-landing px-4 pb-20 pt-6 md:px-6 md:pt-10">
        <Link to="/guide" className="inline-flex items-center gap-1 text-[14px] font-medium text-ink-2 hover:text-ink">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Evaluator guide
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
          <nav aria-label="Documents" className="lg:sticky lg:top-24 lg:self-start">
            <label htmlFor="doc-select" className="mb-1.5 block text-[13px] font-medium text-ink-2 lg:hidden">
              Document
            </label>
            <select id="doc-select" value={doc.slug} onChange={(e) => navigate(`/guide/docs/${e.target.value}`)} className="field w-full lg:hidden">
              {DOCS.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.title}
                </option>
              ))}
            </select>
            <ul className="hidden space-y-0.5 lg:block">
              {DOCS.map((d) => (
                <li key={d.slug}>
                  <Link
                    to={`/guide/docs/${d.slug}`}
                    aria-current={d.slug === doc.slug ? 'page' : undefined}
                    className={cn('block rounded-[10px] px-3 py-2 transition-colors', d.slug === doc.slug ? 'bg-peacock-soft' : 'hover:bg-ink/[0.04]')}
                  >
                    <span className={cn('block text-[14.5px]', d.slug === doc.slug ? 'font-semibold text-peacock-deep' : 'font-medium text-ink')}>{d.title}</span>
                    <span className="block text-[12.5px] leading-4 text-ink-2">{d.file}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-6 hidden border-t border-line pt-5 lg:block">
              <p className="mb-2 px-3 text-[13px] font-medium text-ink-2">Downloads</p>
              <ul className="space-y-0.5">
                {DOWNLOADS.map((d) => (
                  <li key={d.path}>
                    <a href={assetUrl(d.path)} download className="flex items-center gap-2 rounded-[10px] px-3 py-1.5 text-[14px] text-ink hover:bg-ink/[0.04]">
                      <Download className="h-4 w-4 text-ink-3" aria-hidden />
                      {d.label}
                      <span className="text-[12.5px] text-ink-3">{d.note}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <article className="min-w-0 rounded-panel border border-line bg-surface px-5 py-7 shadow-rest md:px-10 md:py-10">
            <p className="mb-6 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-2">
              <span className="font-medium text-ink">{doc.file}</span>
              <span>{doc.summary}</span>
            </p>
            <div className="doc" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
          </article>
        </div>
      </div>
      <SiteFooter />
    </div>
  )
}
