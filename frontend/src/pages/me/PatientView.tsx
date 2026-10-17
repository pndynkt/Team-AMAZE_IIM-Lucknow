import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, Send, Share2, StickyNote, Utensils, Volume2, VolumeX } from 'lucide-react'
import { api } from '@/api/client'
import { useApi, usePoll } from '@/api/hooks'
import type { AnnotationKind, Escalation, MeDriver, MeView, TierOrOptedOut, WhatHelps } from '@/api/types'
import { Glyph, Wordmark, type GlyphName } from '@/brand'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { SimulatedTag } from '@/components/ui/Chip'
import { Button, RouteButton } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { TIER_ICON } from '@/components/ui/TierChip'
import { LangContext, useLang, type Lang } from '@/i18n'
import { useMeta } from '@/lib/meta'
import { fmtTime, splitMeta, TIER_TEXT } from '@/lib/format'
import { cn } from '@/lib/cn'
import { SosFlow } from './SosFlow'
import { ConsentSheet } from './ConsentSheet'

const LANG_KEY = 'pratibimb-lang'

export default function PatientView() {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return localStorage.getItem(LANG_KEY) === 'hi' ? 'hi' : 'en'
    } catch {
      return 'en'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      /* storage unavailable: the choice lasts for this visit */
    }
    document.documentElement.lang = lang
    return () => {
      document.documentElement.lang = 'en'
    }
  }, [lang])
  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <PatientViewInner />
    </LangContext.Provider>
  )
}

/** "47 min ago" in English or Hindi, on the cohort clock. */
function agoWords(min: number, lang: Lang): string {
  if (lang === 'hi') {
    if (min < 1) return 'अभी'
    if (min < 60) return `${min} मिनट पहले`
    const h = Math.round(min / 60)
    return h < 48 ? `${h} घंटे पहले` : `${Math.round(h / 24)} दिन पहले`
  }
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

function PatientViewInner() {
  const { id = 'P-0007' } = useParams()
  const { t, lang } = useLang()
  const { meta } = useMeta()
  const toast = useToast()
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameEl, setFrameEl] = useState<HTMLElement | null>(null)
  const [consentOpen, setConsentOpen] = useState(false)
  const hi = lang === 'hi'

  useEffect(() => setFrameEl(frameRef.current), [])
  useEffect(() => {
    document.title = 'Pratibimb'
  }, [])

  const me = useApi(() => api.me(id), [id])
  useEffect(() => {
    if (me.error) toast.error('Could not load your reflection', me.refetch, me.error.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.error])

  // Pick up an escalation that is already running (after a refresh, or one started elsewhere).
  const [escalation, setEscalation] = useState<Escalation | null>(null)
  const activeList = usePoll(() => api.escalations('active'), 4000, !escalation, [id])
  const existing = useMemo(() => (activeList.data ?? []).find((e) => e.patient_id === id && e.state !== 'resolved' && e.state !== 'cancelled') ?? null, [activeList.data, id])

  const m = me.data
  const hour = new Date().getHours()
  const greeting = hour < 12 ? t.greeting_morning : hour < 17 ? t.greeting_afternoon : t.greeting_evening

  return (
    <div className="min-h-screen bg-mist md:flex md:items-start md:justify-center md:gap-16 md:px-8 md:py-10">
      <aside className="hidden md:block md:w-[300px] md:shrink-0">
        <div className="sticky top-10 mt-20">
          <Link to="/" aria-label="Pratibimb home">
            <Wordmark size="md" />
          </Link>
          <p className="mt-6 text-[22px] font-650 leading-tight tracking-[-0.02em] text-ink">The patient view, as it looks on a phone.</p>
          <p className="mt-3 text-[15px] leading-6 text-ink-2">Status in words first, then the number. Every comparison is to the person's own usual. Hold SOS to see the check-in ladder; the console follows it live.</p>
          <div className="mt-5 flex flex-col items-start gap-2">
            <RouteButton to="/console" variant="secondary" size="sm">
              Open the clinician console
            </RouteButton>
            <Link to="/me/P-0240" className="px-1 text-[13.5px] font-medium text-peacock-deep hover:underline">
              See a new enrolment that is still calibrating
            </Link>
          </div>
        </div>
      </aside>

      <div
        ref={frameRef}
        className="relative mx-auto flex h-[100dvh] w-full max-w-phone flex-col overflow-hidden bg-mist md:mx-0 md:h-[932px] md:w-[430px] md:shrink-0 md:rounded-[44px] md:border md:border-line-strong md:shadow-lift"
      >
        <div className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin" style={{ background: 'linear-gradient(180deg, rgb(var(--dawn)) 0px, rgb(var(--dawn)) 120px, rgb(var(--mist)) 520px)' }}>
          <div className="px-5 pb-10 pt-5">
            <header className="flex items-center justify-between">
              <Link to="/" aria-label="Pratibimb home">
                <Wordmark size="md" />
              </Link>
              <button type="button" onClick={() => setConsentOpen(true)} className={cn('inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface/80 px-3.5 text-[14px] font-medium text-ink hover:bg-surface', hi && 'font-devanagari')}>
                <Glyph name="consent" size={17} tone="current" className="text-leaf" />
                {t.consent}
              </button>
            </header>

            <div className="mt-6">
              <p className={cn('text-[17px] text-ink-2', hi && 'font-devanagari')}>{greeting},</p>
              <h1 className="text-[34px] font-650 leading-tight tracking-[-0.03em] text-ink">{m ? m.first_name : <Skeleton className="inline-block h-9 w-36 align-middle" />}</h1>
              {m && (
                <p className={cn('mt-1.5 flex flex-wrap items-center gap-2 text-[14px] text-ink-2', hi && 'font-devanagari')}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', m.freshness.label === 'fresh' ? 'bg-leaf' : m.freshness.label === 'stale' ? 'bg-turmeric' : 'bg-stone')} aria-hidden />
                  {m.freshness.label === 'fresh' ? t.watch_synced(m.device.brand, agoWords(m.freshness.minutes_ago, lang)) : m.freshness.label === 'stale' ? t.watch_stale(m.device.brand, agoWords(m.freshness.minutes_ago, lang)) : t.watch_offline(m.device.brand)}
                  {m.device.simulated && <SimulatedTag label={t.simulated} />}
                </p>
              )}
            </div>

            {me.error && !m ? (
              <ErrorState className="mt-6" title="Your reflection did not load" body={me.error.message} onRetry={me.refetch} />
            ) : !m ? (
              <div className="mt-6 space-y-4" aria-busy="true">
                <Skeleton className="h-[300px] rounded-panel" />
                <Skeleton className="h-[180px] rounded-panel" />
                <Skeleton className="h-[140px] rounded-panel" />
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <Status m={m} />
                <Drivers drivers={m.drivers} calibrating={m.score.state === 'calibrating'} />
                <Sentence m={m} />
                {m.what_helps && m.what_helps.length > 0 && <WhatHelpsList items={m.what_helps} />}
                <CheckinCard id={id} question={hi ? m.checkin.question.hi : m.checkin.question.en} options={m.checkin.options} pending={m.checkin.pending} onDone={() => me.setData((prev) => (prev ? { ...prev, checkin: { ...prev.checkin, pending: false } } : prev))} />
                <LogRow id={id} date={meta.as_of} />
                <section className="rounded-panel border border-sindoor/15 bg-surface p-5 shadow-rest" aria-label={t.sos}>
                  <SosFlow patientId={id} existing={existing} onEscalationChange={setEscalation} container={frameEl} />
                </section>
                <People m={m} />
                <ShareCard title={m.share_card.title} lines={m.share_card.lines} footer={m.share_card.footer} />

                <footer className="space-y-2 px-1 pt-2">
                  <p className={cn('text-[13px] leading-5 text-ink-2', hi && 'font-devanagari')}>{t.disclaimer}</p>
                  <p className="flex gap-3 text-[12.5px] text-ink-3">
                    <span>Pratibimb</span>
                    <span className="tnum">{meta.version}</span>
                  </p>
                </footer>
              </div>
            )}
          </div>
        </div>

        <ConsentSheet open={consentOpen} onClose={() => setConsentOpen(false)} patientId={id} container={frameEl} onChanged={() => void me.refetch()} />
      </div>
    </div>
  )
}

function statusTier(m: MeView): TierOrOptedOut {
  if (m.score.value === null || m.score.ring_color === 'opted_out') return 'opted_out'
  return m.score.ring_color
}

function Status({ m }: { m: MeView }) {
  const { t, lang } = useLang()
  const hi = lang === 'hi'
  const calibrating = m.score.state === 'calibrating'
  const tier = statusTier(m)
  const Icon = TIER_ICON[tier]
  const word = calibrating ? t.calibrating : t.status[tier]
  const body = calibrating ? t.calibrating_body : t.status_body[tier]
  return (
    <section className="rounded-panel bg-surface px-5 pb-6 pt-5 text-center shadow-rest" aria-label={t.score_title}>
      <p className={cn('text-[14px] text-ink-2', hi && 'font-devanagari')}>{t.score_title}</p>
      <h2 className={cn('mt-2 inline-flex items-center justify-center gap-2 text-[26px] font-650 leading-tight tracking-[-0.02em]', calibrating ? 'text-ink' : TIER_TEXT[tier], hi && 'font-devanagari')}>
        {calibrating ? <Glyph name="twin" size={24} tone="current" className="text-peacock" /> : <Icon className="h-6 w-6" strokeWidth={2.2} aria-hidden />}
        {word}
      </h2>
      <p className={cn('mx-auto mt-1 max-w-[300px] text-[15px] leading-6 text-ink-2', hi && 'font-devanagari')}>{body}</p>
      <div className="mt-4 flex justify-center">
        {calibrating ? (
          <ScoreRing value={null} tier="low" progress={Math.min(1, m.score.nights_available / Math.max(1, m.score.nights_needed))} size={176} stroke={13} label={t.nights_of(m.score.nights_available, m.score.nights_needed)}>
            <span className="tnum text-[40px] font-650 leading-none tracking-[-0.04em] text-ink">
              {m.score.nights_available}
              <span className="text-[20px] text-ink-3">/{m.score.nights_needed}</span>
            </span>
            <span className={cn('mt-1.5 text-[13px] text-ink-2', hi && 'font-devanagari')}>{hi ? 'रातें' : 'nights'}</span>
          </ScoreRing>
        ) : (
          <ScoreRing value={m.score.value} tier={tier} size={176} stroke={13} label={m.score.value === null ? word : `${word}, ${m.score.value} ${t.out_of_100}`}>
            <span className="tnum text-[50px] font-650 leading-none tracking-[-0.045em] text-ink">{m.score.value ?? '--'}</span>
            <span className={cn('mt-1 text-[13px] text-ink-2', hi && 'font-devanagari')}>{t.out_of_100}</span>
          </ScoreRing>
        )}
      </div>
    </section>
  )
}

const DRIVER_GLYPH: Record<string, GlyphName> = { 'Resting heart rate': 'heart', Sleep: 'sleep', Steps: 'steps', 'Morning BP': 'bp', HRV: 'hrv' }

/** "+9" or "+8 bpm" with value "71 bpm" gives "9 bpm"; "-38%" gives "38%". */
function magnitude(d: MeDriver): string {
  const raw = d.vs_baseline.replace(/^[+\-−]\s*/, '').trim()
  if (/[a-z%]/i.test(raw)) return raw
  const unit = d.value.match(/[a-z%]+$/i)?.[0]
  return unit ? `${raw} ${unit}` : raw
}

function Drivers({ drivers, calibrating }: { drivers: MeDriver[]; calibrating: boolean }) {
  const { t, lang } = useLang()
  const hi = lang === 'hi'
  return (
    <section aria-labelledby="drivers-title">
      <h2 id="drivers-title" className={cn('mb-2.5 px-1 text-[17px] font-semibold text-ink', hi && 'font-devanagari')}>
        {t.compared_title}
      </h2>
      <ul className="divide-y divide-line rounded-panel bg-surface px-4 shadow-rest">
        {drivers.map((d) => {
          const flat = calibrating || d.arrow === 'flat' || /^[+\-]?\s*0(\s|%|$)/.test(d.vs_baseline)
          return (
            <li key={d.label} className="flex items-center gap-3.5 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2">
                <Glyph name={DRIVER_GLYPH[d.label] ?? 'twin'} size={22} tone="identity" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-[14px] text-ink-2', hi && 'font-devanagari')}>{t.drivers[d.label] ?? d.label}</p>
                <p className="tnum text-[20px] font-semibold leading-tight tracking-[-0.01em] text-ink">{d.value}</p>
              </div>
              <Comparison d={d} flat={flat} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Comparison({ d, flat }: { d: MeDriver; flat: boolean }) {
  const { t, lang } = useLang()
  const hi = lang === 'hi'
  if (flat || /learning/i.test(d.vs_baseline)) {
    return <p className={cn('max-w-[132px] text-right text-[14px] leading-5 text-ink-2', hi && 'font-devanagari')}>{/learning/i.test(d.vs_baseline) ? t.learning : t.same}</p>
  }
  const amountWords = d.label === 'Sleep' || d.label === 'Steps'
  const dir = d.arrow === 'up' ? (amountWords ? t.more : t.higher) : amountWords ? t.less : t.lower
  return (
    <div className={cn('shrink-0 text-right', d.good ? 'text-leaf' : 'text-sindoor')}>
      <p className="inline-flex items-center justify-end gap-1 tnum text-[16px] font-semibold leading-tight">
        {d.arrow === 'up' ? <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden /> : <ArrowDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />}
        {magnitude(d)}
      </p>
      <p className={cn('text-[13px] leading-5', hi && 'font-devanagari')}>{dir}</p>
    </div>
  )
}

function Sentence({ m }: { m: MeView }) {
  const { t, lang, setLang } = useLang()
  const hi = lang === 'hi'
  const now = new Date(m.freshness.last_sample_at).getTime() + m.freshness.minutes_ago * 60000
  const mins = Math.round((now - new Date(m.doctor.reviewed_at).getTime()) / 60000)
  const ago = Number.isFinite(mins) && mins >= 0 ? agoWords(mins, lang) : fmtTime(m.doctor.reviewed_at)
  return (
    <section className="rounded-panel bg-lotus-soft/60 p-5" aria-label="Today in plain words">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tabs
          variant="segmented"
          size="sm"
          aria-label="Language"
          value={lang}
          onChange={setLang}
          items={[
            { key: 'en', label: 'English' },
            { key: 'hi', label: <span className="font-devanagari">हिन्दी</span> },
          ]}
        />
        <Speaker text={hi ? m.sentence.hi : m.sentence.en} speechLang={hi ? 'hi-IN' : 'en-IN'} />
      </div>
      <p lang={hi ? 'hi' : 'en'} className={cn('text-[18px] leading-[1.55] text-ink', hi && 'font-devanagari text-[19px]')}>
        {hi ? m.sentence.hi : m.sentence.en}
      </p>
      <p className={cn('mt-3 flex items-center gap-1.5 text-[13px] text-ink-2', hi && 'font-devanagari')}>
        <Glyph name="doctor" size={15} tone="current" className="text-ink-3" />
        {t.reviewed_by(m.doctor.name, ago)}
      </p>
    </section>
  )
}

function Speaker({ text, speechLang }: { text: string; speechLang: 'en-IN' | 'hi-IN' }) {
  const { t, lang } = useLang()
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
  const [speaking, setSpeaking] = useState(false)
  useEffect(
    () => () => {
      if (supported) window.speechSynthesis.cancel()
    },
    [supported],
  )
  const toggle = () => {
    if (!supported) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = speechLang
    u.rate = 0.92
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
    setSpeaking(true)
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!supported}
      title={supported ? undefined : 'This browser cannot read aloud'}
      aria-pressed={speaking}
      className={cn('inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[14px] font-medium text-ink shadow-[0_1px_2px_rgba(16,48,47,0.1)] hover:bg-surface-2 disabled:opacity-50', lang === 'hi' && 'font-devanagari')}
    >
      {speaking ? <VolumeX className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
      {speaking ? t.stop_listening : t.listen}
    </button>
  )
}

const HELP_GLYPH: Record<string, GlyphName> = { walking: 'steps', sleep: 'sleep', medication: 'medicine', medicine: 'medicine' }

function WhatHelpsList({ items }: { items: WhatHelps[] }) {
  const { t, lang } = useLang()
  const hi = lang === 'hi'
  return (
    <section aria-labelledby="helps-title">
      <div className="mb-2.5 px-1">
        <h2 id="helps-title" className={cn('text-[17px] font-semibold text-ink', hi && 'font-devanagari')}>
          {t.what_helps_title}
        </h2>
        <p className={cn('text-[13.5px] text-ink-2', hi && 'font-devanagari')}>{t.what_helps_body}</p>
      </div>
      <ul className="space-y-2.5">
        {items.map((w, i) => (
          <li key={i} className="flex gap-3.5 rounded-panel bg-surface p-4 shadow-rest">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-leaf-soft">
              <Glyph name={HELP_GLYPH[w.lever] ?? 'twin'} size={24} tone="identity" />
            </span>
            <div className="min-w-0">
              <p lang={hi ? 'hi' : 'en'} className={cn('text-[15.5px] leading-[1.45] text-ink', hi && 'font-devanagari')}>
                {hi ? w.hi : w.en}
              </p>
              <p className={cn('mt-1 text-[13px] font-medium', w.strength === 'strong' ? 'text-leaf' : 'text-ink-2', hi && 'font-devanagari')}>{t.strength[w.strength]}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CheckinCard({ id, question, options, pending, onDone }: { id: string; question: string; options: string[]; pending: boolean; onDone: () => void }) {
  const { t, lang } = useLang()
  const toast = useToast()
  const hi = lang === 'hi'
  const [choice, setChoice] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'thanks' | 'thanks_alert' | null>(null)

  const submit = async () => {
    if (!choice) return
    setBusy(true)
    try {
      const r = await api.checkin(id, { answer: choice, note: note.trim() || undefined })
      setResult(r.alert_created ? 'thanks_alert' : 'thanks')
      onDone()
    } catch (e) {
      toast.error('Could not send your check-in', submit, e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  if (!pending || result) {
    return (
      <section className="flex items-center gap-3 rounded-panel bg-surface p-4 shadow-rest" aria-live="polite">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-leaf">
          <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        </span>
        <p className={cn('text-[15px] text-ink', hi && 'font-devanagari')}>{result === 'thanks_alert' ? t.checkin_thanks_alert : t.checkin_thanks}</p>
      </section>
    )
  }

  return (
    <section className="rounded-panel bg-surface p-5 shadow-rest" aria-label={question}>
      <h2 lang={hi ? 'hi' : 'en'} className={cn('text-[18px] font-semibold tracking-[-0.01em]', hi && 'font-devanagari')}>
        {question}
      </h2>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={question}>
        {options.map((o) => {
          const on = choice === o
          const serious = o === 'Chest discomfort'
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setChoice(o)}
              className={cn(
                'min-h-[56px] rounded-block border px-3 text-[15.5px] font-medium leading-tight transition-colors',
                on ? (serious ? 'border-sindoor-solid bg-sindoor-solid text-white' : 'border-peacock-deep bg-peacock-deep text-on-peacock') : 'border-line-strong bg-surface text-ink hover:bg-surface-2',
                hi && 'font-devanagari',
              )}
            >
              {t.options[o] ?? o}
            </button>
          )
        })}
      </div>
      {choice && (
        <div className="mt-3 flex gap-2">
          <label htmlFor="checkin-note" className="sr-only">
            {t.checkin_note_placeholder}
          </label>
          <input id="checkin-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.checkin_note_placeholder} className={cn('field h-12 min-w-0 flex-1 text-[15px]', hi && 'font-devanagari')} />
          <Button size="lg" loading={busy} onClick={submit} icon={<Send />} className={cn(hi && 'font-devanagari')}>
            {t.send}
          </Button>
        </div>
      )}
    </section>
  )
}

function LogRow({ id, date }: { id: string; date: string }) {
  const { t, lang } = useLang()
  const toast = useToast()
  const hi = lang === 'hi'
  const [kind, setKind] = useState<AnnotationKind | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const kinds: { key: AnnotationKind; label: string; icon: React.ReactNode }[] = [
    { key: 'symptom', label: t.symptom, icon: <Glyph name="heart" size={20} tone="current" /> },
    { key: 'missed_dose', label: t.missed_dose, icon: <Glyph name="medicine" size={20} tone="current" /> },
    { key: 'meal', label: t.meal, icon: <Utensils className="h-5 w-5" strokeWidth={1.8} aria-hidden /> },
    { key: 'note', label: t.note, icon: <StickyNote className="h-5 w-5" strokeWidth={1.8} aria-hidden /> },
  ]
  const submit = async () => {
    if (!kind || !label.trim()) return
    setBusy(true)
    try {
      await api.annotateMe(id, { date, kind, label: label.trim() })
      setDone(label.trim())
      setKind(null)
      setLabel('')
      toast.success(t.logged)
    } catch (e) {
      toast.error('Could not save', submit, e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="rounded-panel bg-surface p-5 shadow-rest" aria-label={t.log_something}>
      <h2 className={cn('text-[16px] font-semibold text-ink', hi && 'font-devanagari')}>{t.log_something}</h2>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {kinds.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(kind === k.key ? null : k.key)}
            aria-pressed={kind === k.key}
            className={cn('flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-block border px-1 text-center text-[12.5px] font-medium leading-tight transition-colors', kind === k.key ? 'border-peacock bg-peacock-soft text-peacock-deep' : 'border-line bg-surface-2 text-ink-2 hover:bg-mist', hi && 'font-devanagari')}
          >
            {k.icon}
            {k.label}
          </button>
        ))}
      </div>
      {kind && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label htmlFor="log-label" className="sr-only">
            {t.log_placeholder}
          </label>
          <input id="log-label" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.log_placeholder} className={cn('field h-12 min-w-0 flex-1 text-[15px]', hi && 'font-devanagari')} />
          <Button type="submit" size="lg" loading={busy} disabled={!label.trim()} className={cn(hi && 'font-devanagari')}>
            {t.send}
          </Button>
        </form>
      )}
      {done && !kind && (
        <p className={cn('mt-3 inline-flex items-center gap-1.5 text-[14px] text-leaf', hi && 'font-devanagari')} aria-live="polite">
          <Check className="h-4 w-4" aria-hidden /> {t.logged}: {done}
        </p>
      )}
    </section>
  )
}

function People({ m }: { m: MeView }) {
  const { t, lang } = useLang()
  const hi = lang === 'hi'
  return (
    <section className="grid grid-cols-2 divide-x divide-line rounded-panel bg-surface shadow-rest">
      <div className="p-4">
        <h2 className={cn('flex items-center gap-1.5 text-[14px] font-semibold text-ink', hi && 'font-devanagari')}>
          <Glyph name="family" size={17} tone="current" className="text-ink-3" /> {t.contacts}
        </h2>
        <ul className="mt-2 space-y-1.5">
          {m.contacts.map((c) => (
            <li key={c.name} className="text-[14.5px] leading-tight">
              <span className="font-medium text-ink">{c.name}</span>
              <span className="block text-[13px] text-ink-2">{c.relation}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="p-4">
        <h2 className={cn('flex items-center gap-1.5 text-[14px] font-semibold text-ink', hi && 'font-devanagari')}>
          <Glyph name="doctor" size={17} tone="current" className="text-ink-3" /> {t.doctor}
        </h2>
        <p className="mt-2 text-[14.5px] font-medium leading-tight text-ink">{m.doctor.name}</p>
        <p className="text-[13px] text-ink-2">Physician</p>
      </div>
    </section>
  )
}

function ShareCard({ title, lines, footer }: { title: string; lines: string[]; footer: string }) {
  const { t, lang } = useLang()
  const toast = useToast()
  const hi = lang === 'hi'
  const footerParts = splitMeta(footer)
  const text = `${title}\n${lines.join('\n')}\n${footerParts.join(', ')}`
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text })
        return
      }
      await navigator.clipboard.writeText(text)
      toast.success(t.share_copied)
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(text)
        toast.success(t.share_copied)
      } catch {
        toast.error('Could not share')
      }
    }
  }
  return (
    <section className="rounded-panel bg-surface p-5 shadow-rest" aria-label={t.share_title}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={cn('text-[16px] font-semibold text-ink', hi && 'font-devanagari')}>{t.share_title}</h2>
          <p className={cn('mt-0.5 text-[13px] leading-5 text-ink-2', hi && 'font-devanagari')}>{t.share_body}</p>
        </div>
        <Button size="sm" variant="secondary" icon={<Share2 />} onClick={share} className={cn('shrink-0', hi && 'font-devanagari')}>
          {t.share}
        </Button>
      </div>
      <div className="mt-4 rounded-block bg-[#ECE5DD] p-3" aria-hidden>
        <div className="ml-auto max-w-[88%] rounded-[14px] rounded-tr-[4px] bg-[#DCF8C6] px-3 py-2 text-[14px] leading-5 text-[#111B21] shadow-[0_1px_1px_rgba(0,0,0,0.08)]">
          <p className="font-semibold">{title}</p>
          {lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p className="mt-1 flex flex-wrap gap-x-2 text-[12px] text-[#54656F]">
            {footerParts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </p>
        </div>
      </div>
    </section>
  )
}
