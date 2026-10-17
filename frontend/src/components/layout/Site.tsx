import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Wordmark } from '@/brand'
import { DISCLAIMER } from './Disclaimer'
import { cn } from '@/lib/cn'

const LINKS = [
  { to: '/console', label: 'Clinician console' },
  { to: '/me/P-0007', label: 'Patient view' },
  { to: '/guide', label: 'Evaluator guide' },
]

/** Header for the landing page and the evaluator guide. */
export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={cn('sticky top-0 z-40 bg-mist/95 transition-[border-color]', scrolled ? 'border-b border-line' : 'border-b border-transparent')}>
      <div className="mx-auto flex h-16 max-w-landing items-center justify-between gap-6 px-4 md:px-6">
        <Link to="/" aria-label="Pratibimb home" className="shrink-0">
          <Wordmark size="md" />
        </Link>
        <nav className="hidden items-center gap-7 text-[14.5px] md:flex" aria-label="Primary">
          {LINKS.slice(0, 3).map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('font-medium transition-colors hover:text-ink', isActive ? 'text-ink' : 'text-ink-2')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-control text-ink-2 hover:bg-ink/[0.05] md:hidden" aria-expanded={open} aria-controls="site-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav id="site-menu" className="border-t border-line bg-mist px-4 pb-4 pt-2 md:hidden" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="block rounded-control px-2 py-3 text-[16px] font-medium text-ink hover:bg-ink/[0.04]">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-landing gap-8 px-4 py-12 md:grid-cols-[1.4fr_1fr] md:px-6">
        <div className="max-w-md">
          <Wordmark size="sm" />
          <p className="mt-4 text-[14px] leading-6 text-ink-2">{DISCLAIMER}</p>
        </div>
        <div className="grid grid-cols-2 gap-6 text-[14px]">
          <ul className="space-y-2.5">
            <li>
              <Link to="/console" className="text-ink-2 hover:text-ink">
                Clinician console
              </Link>
            </li>
            <li>
              <Link to="/me/P-0007" className="text-ink-2 hover:text-ink">
                Patient view
              </Link>
            </li>
            <li>
              <Link to="/console/model" className="text-ink-2 hover:text-ink">
                Model card
              </Link>
            </li>
          </ul>
          <ul className="space-y-2.5">
            <li>
              <Link to="/guide" className="text-ink-2 hover:text-ink">
                Evaluator guide
              </Link>
            </li>
            <li>
              <Link to="/guide/docs/readme" className="text-ink-2 hover:text-ink">
                Documents
              </Link>
            </li>
            <li className="text-ink-2">MIT licence</li>
          </ul>
          <p className="col-span-2 text-[13px] leading-5 text-ink-3">Built for the Happiest Health Digital Twin Challenge 2026. Synthetic cohort of 240 people, seed 42.</p>
        </div>
      </div>
    </footer>
  )
}

