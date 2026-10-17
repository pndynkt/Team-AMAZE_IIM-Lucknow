import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Bell, BookOpen, LineChart, ListOrdered, ScrollText, Search, Settings, SlidersHorizontal } from 'lucide-react'
import { api } from '@/api/client'
import { useApi, usePoll } from '@/api/hooks'
import { Wordmark } from '@/brand'
import { useMeta } from '@/lib/meta'
import { fmtDayFull } from '@/lib/format'
import { readTheme, setDarkClass } from '@/lib/theme'
import { cn } from '@/lib/cn'
import { escalationShort } from '@/components/domain/EscalationLadder'

const NAV = [
  { to: '/console', label: 'Today', icon: ListOrdered, end: true },
  { to: '/console/alerts', label: 'Alerts', icon: Bell, count: true },
  { to: '/console/thresholds', label: 'Thresholds', icon: SlidersHorizontal },
  { to: '/console/model', label: 'Model', icon: LineChart },
  { to: '/console/audit', label: 'Audit', icon: ScrollText },
  { to: '/guide', label: 'Evaluator guide', icon: BookOpen },
  { to: '/console/settings', label: 'Settings', icon: Settings },
] as const

export function ConsoleShell() {
  const { meta, clinician } = useMeta()
  const location = useLocation()
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  // Dark theme is a console setting: on while the console is mounted, off when leaving it.
  useEffect(() => {
    setDarkClass(readTheme() === 'dark')
    return () => setDarkClass(false)
  }, [])
  useEffect(() => {
    document.title = 'Pratibimb console'
  }, [])

  const openAlerts = useApi(() => api.alerts({ status: 'open' }), [location.pathname])
  const openCount = openAlerts.data?.alerts.length ?? null
  const initials = useMemo(() => clinician.replace(/^Dr\s+/i, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(), [clinician])

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(q.trim() ? `/console?q=${encodeURIComponent(q.trim())}` : '/console')
  }

  return (
    <div className="flex min-h-screen bg-mist">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow-lift">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-rail shrink-0 flex-col border-r border-line px-4 pb-5 pt-6 lg:flex" aria-label="Console">
        <Link to="/" className="mb-6 inline-flex px-2" aria-label="Pratibimb home">
          <Wordmark size="sm" />
        </Link>
        <form onSubmit={submitSearch} role="search" className="relative mb-4">
          <label htmlFor="rail-search" className="sr-only">
            Find a person
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input id="rail-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" className="field h-9 w-full rounded-[10px] bg-surface pl-9 text-[13.5px]" />
        </form>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={'end' in n ? n.end : undefined}
              className={({ isActive }) =>
                cn(
                  'flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-[14px] transition-colors',
                  isActive ? 'bg-peacock-soft font-semibold text-peacock-deep dark:text-ink' : 'font-medium text-ink-2 hover:bg-ink/[0.045] hover:text-ink',
                )
              }
            >
              <n.icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} aria-hidden />
              <span className="flex-1">{n.label}</span>
              {'count' in n && openCount !== null && openCount > 0 && (
                <span className="tnum text-[12.5px] font-medium text-ink-2" aria-label={`${openCount} open`}>
                  {openCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-4 px-2.5 text-[12.5px] leading-5 text-ink-2">
          <div>
            <p className="text-ink-3">Cohort as of</p>
            <p className="font-medium text-ink">{fmtDayFull(meta.as_of)}</p>
            <p>
              <span className="tnum">{meta.cohort_size}</span> people, synthetic
            </p>
          </div>
          <div className="flex items-center gap-2.5 border-t border-line pt-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lotus-soft text-[12px] font-semibold text-lotus-text" aria-hidden>
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{clinician}</p>
              <p>Physician</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-mist/95 lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/" aria-label="Pratibimb home">
              <Wordmark size="sm" />
            </Link>
            <span className="text-[12.5px] text-ink-2">{clinician}</span>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Console sections">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : undefined} className={({ isActive }) => cn('whitespace-nowrap rounded-[10px] px-3 py-1.5 text-[13.5px] font-medium', isActive ? 'bg-peacock-soft text-peacock-deep dark:text-ink' : 'text-ink-2')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <EscalationBanner currentPath={location.pathname} />

        <main id="main" className="mx-auto w-full max-w-console flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** Shown while any escalation is running. Polls every 2 s. Plain sentence, a link to the person. */
function EscalationBanner({ currentPath }: { currentPath: string }) {
  const reduce = useReducedMotion()
  const { data } = usePoll(() => api.escalations('active'), 2000, true)
  const active = (data ?? []).filter((e) => e.state !== 'resolved' && e.state !== 'cancelled')
  return (
    <AnimatePresence initial={false}>
      {active.length > 0 && (
        <motion.div
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.24, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="border-b border-sindoor/15 bg-sindoor-soft" role="status" aria-live="polite">
            <ul className="mx-auto max-w-console space-y-1 px-4 py-3 md:px-8">
              {active.slice(0, 2).map((es) => {
                const here = currentPath === `/console/patients/${es.patient_id}`
                const first = es.patient_name.split(' ')[0]
                return (
                  <li key={es.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-sindoor" strokeWidth={2.1} aria-hidden />
                    <span>
                      <span className="font-semibold">Escalation in progress for {es.patient_name}:</span> {escalationShort(es)}.
                    </span>
                    {!here && (
                      <Link to={`/console/patients/${es.patient_id}?tab=alerts`} className="font-semibold text-sindoor underline decoration-sindoor/40 underline-offset-[3px] hover:decoration-sindoor">
                        Open {first}'s ladder
                      </Link>
                    )}
                  </li>
                )
              })}
              {active.length > 2 && <li className="pl-7 text-[13px] text-ink-2">{active.length - 2} more on the Alerts page.</li>}
            </ul>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        <h1 className="text-[30px] font-650 leading-[1.12] tracking-[-0.025em] text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] leading-6 text-ink-2">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
