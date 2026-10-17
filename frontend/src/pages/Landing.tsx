import { useEffect, useMemo, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { api } from '@/api/client'
import type { AlertBudget, Forecast, MeView, ModelCard, Patient, Physiology, Timeline } from '@/api/types'
import timelineFx from '@/api/fixtures/timeline-P-0007.json'
import forecastFx from '@/api/fixtures/forecast-P-0007.json'
import patientFx from '@/api/fixtures/patient-P-0007.json'
import meFx from '@/api/fixtures/me-P-0007.json'
import physiologyFx from '@/api/fixtures/physiology-P-0007.json'
import modelFx from '@/api/fixtures/model.json'
import alertsFx from '@/api/fixtures/alerts.json'
import { Glyph, Mark, type GlyphName } from '@/brand'
import { HeroTwinChart } from '@/charts/HeroTwinChart'
import { RouteButton } from '@/components/ui/Button'
import { SimulatedTag } from '@/components/ui/Chip'
import { TierChip } from '@/components/ui/TierChip'
import { PhysiologyDotFluid } from '@/components/domain/PhysiologyDot'
import { SiteFooter, SiteHeader } from '@/components/layout/Site'
import { fmtPct, pronoun } from '@/lib/format'
import { cn } from '@/lib/cn'

interface Snapshot {
  patient: Patient
  timeline: Timeline
  forecast: Forecast
  me: MeView
  physiology: Physiology
  model: ModelCard
  budget: AlertBudget
}

const FALLBACK: Snapshot = {
  patient: patientFx as unknown as Patient,
  timeline: timelineFx as unknown as Timeline,
  forecast: forecastFx as unknown as Forecast,
  me: meFx as unknown as MeView,
  physiology: physiologyFx as unknown as Physiology,
  model: modelFx as unknown as ModelCard,
  budget: alertsFx.budget as unknown as AlertBudget,
}

/** Meera's twin from the live server, piece by piece, with the bundled snapshot as the fallback for any piece. */
function useMeera(): Snapshot {
  const [snap, setSnap] = useState<Snapshot>(FALLBACK)
  useEffect(() => {
    let alive = true
    const id = 'P-0007'
    const take = <K extends keyof Snapshot>(key: K, p: Promise<Snapshot[K]>) =>
      p.then((v) => alive && setSnap((s) => ({ ...s, [key]: v }))).catch(() => {
        /* keep the bundled snapshot for this piece */
      })
    // The forecast and the timeline must come from the same source, so they travel together.
    Promise.all([api.timeline(id, 30), api.forecast(id)])
      .then(([timeline, forecast]) => alive && setSnap((s) => ({ ...s, timeline, forecast })))
      .catch(() => {})
    void take('patient', api.patient(id))
    void take('me', api.me(id))
    void take('physiology', api.physiology(id))
    void take('model', api.model())
    void take('budget', api.alerts({ status: 'open' }).then((r) => r.budget))
    return () => {
      alive = false
    }
  }, [])
  return snap
}

export default function Landing() {
  useEffect(() => {
    document.title = 'Pratibimb, a reflection of you, a day ahead'
  }, [])
  const s = useMeera()
  return (
    <div className="min-h-screen bg-mist text-ink">
      <SiteHeader />
      <main>
        <Hero s={s} />
        <TwoStreams s={s} />
        <CheapWatch />
        <Physiology s={s} />
        <Honest s={s} />
        <Ladder />
        <Safe />
        <Evaluators />
      </main>
      <SiteFooter />
    </div>
  )
}

function Section({ id, title, body, children, className }: { id?: string; title: string; body: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn('mx-auto max-w-landing scroll-mt-20 px-4 py-14 md:px-6 md:py-20', className)}>
      <div className="max-w-3xl">
        <h2 className="text-[32px] font-650 leading-[1.12] tracking-[-0.025em] text-ink md:text-[40px]">{title}</h2>
        <p className="mt-4 max-w-2xl text-[17px] leading-[1.6] text-ink-2">{body}</p>
      </div>
      <div className="mt-10 md:mt-12">{children}</div>
    </section>
  )
}

function useWide(query = '(min-width: 1024px)'): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return wide
}

function Hero({ s }: { s: Snapshot }) {
  const wide = useWide()
  const f = s.forecast
  const band = s.timeline.baseline_band.rhr
  const tomorrow = f.rhr[0]
  const p = s.patient
  return (
    <section className="mx-auto grid max-w-landing items-center gap-12 px-4 pb-16 pt-10 md:px-6 md:pb-24 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-14">
      <div>
        <h1 className="text-[46px] font-650 leading-[1.04] tracking-[-0.035em] text-ink md:text-display">A reflection of you, a day ahead.</h1>
        <p className="mt-6 max-w-[34rem] text-[18px] leading-[1.6] text-ink-2 md:text-[19px]">
          Pratibimb joins the health record your doctor keeps with the heart rate, sleep and home BP from an everyday watch, and tells you both, in plain words, when the next three days need attention.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <RouteButton to="/console" size="lg">
            Open the clinician console
          </RouteButton>
          <RouteButton to="/me/P-0007" size="lg" variant="secondary">
            Open the patient view
          </RouteButton>
        </div>
        <p className="mt-5 text-[14px] text-ink-2">For adults in India living with high blood pressure. Synthetic data, research proof of concept.</p>
      </div>

      <figure className="min-w-0">
        <div className="mb-3 flex justify-center">
          <Mark size={wide ? 248 : 188} animated assemble reflection title="Pratibimb: two streams meeting in one ring, reflected in water" />
        </div>
        <div className="panel p-4 md:p-5">
          <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[15px] font-semibold text-ink">{p.name}</span>
              <span className="flex gap-2.5 text-[13.5px] text-ink-2">
                <span className="tnum">{p.age}</span>
                <span>{p.city}</span>
              </span>
              <SimulatedTag />
            </div>
            <TierChip tier={p.current.tier} />
          </figcaption>
          <p className="mb-1 flex items-center gap-2 px-1 text-[13.5px] font-medium text-ink">
            <Glyph name="heart" size={15} tone="identity" /> Overnight resting heart rate, 30 nights and the next 3
          </p>
          <HeroTwinChart timeline={s.timeline} forecast={f} height={260} />
          <dl className="mt-3 grid grid-cols-1 gap-3 border-t border-line px-1 pt-3 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-ink-2">Tomorrow</dt>
              <dd className="tnum font-semibold text-ink">
                {tomorrow?.p50.toFixed(0)} bpm{' '}
                <span className="font-normal text-ink-2">
                  likely {tomorrow?.p10.toFixed(0)} to {tomorrow?.p90.toFixed(0)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-ink-2">{pronoun(p.sex).her.charAt(0).toUpperCase() + pronoun(p.sex).her.slice(1)} usual</dt>
              <dd className="tnum font-semibold text-ink">
                {band[0].toFixed(0)} to {band[1].toFixed(0)} bpm
              </dd>
            </div>
            <div>
              <dt className="text-ink-2">Strain episode, next 72 h</dt>
              <dd className="tnum font-semibold text-ink">
                {fmtPct(f.probability_72h)}{' '}
                <span className="font-normal text-ink-2">
                  likely {fmtPct(f.band_72h[0])} to {fmtPct(f.band_72h[1])}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </figure>
    </section>
  )
}

function TwoStreams({ s }: { s: Snapshot }) {
  const e = s.patient.ehr
  const bpMed = e.medications.find((m) => ['CCB', 'ACEi', 'ARB', 'Thiazide', 'Diuretic', 'Beta blocker'].includes(m.class)) ?? e.medications[0]
  const hba1c = e.labs.find((l) => /hba1c/i.test(l.name))
  const record: [GlyphName, string, string][] = [
    ['record', 'Conditions', e.conditions.slice(0, 2).map((c) => c.display.replace(/ mellitus$/i, '')).join(', ')],
    ['medicine', 'Medicines', bpMed ? `${bpMed.name}, taken ${bpMed.adherence_30d_pct}% of days` : 'None recorded'],
    ['record', 'Labs', hba1c ? `HbA1c ${hba1c.value}${hba1c.unit}` : `${e.labs.length} results`],
    ['genetics', 'Risk from the record', `Framingham ${s.patient.static_risk.framingham_10y_pct}% over 10 years`],
  ]
  const glyphOf: Record<string, GlyphName> = { 'Resting heart rate': 'heart', Sleep: 'sleep', Steps: 'steps', 'Morning BP': 'bp' }
  const wear: [GlyphName, string, string][] = s.me.drivers.map((d) => [glyphOf[d.label] ?? 'live', d.label, `${d.value}, ${d.vs_baseline.replace(/^\+/, '+')} vs usual`])
  const best = s.physiology.best_lever
  const f = s.forecast
  const her = pronoun(s.patient.sex).her
  return (
    <Section
      id="how"
      title="Two streams, one twin"
      body="The health record says who you are. The watch says how you are tonight. The twin holds both, learns your own usual, and forecasts the next 72 hours with an honest range."
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr_1fr] lg:items-stretch">
        <StreamColumn stream="record" title="Health record" sub="FHIR R4, linked to ABHA" items={record} />
        <div className="flex flex-col justify-center rounded-panel bg-ink px-6 py-7 text-white">
          <div className="flex items-center gap-3">
            <Mark size={44} theme="dark" title="The two streams meet in one ring" />
            <p className="text-[14px] text-white/75">{s.patient.name.split(' ')[0]}'s twin today</p>
          </div>
          <ul className="mt-4 space-y-4">
            <li>
              <p className="text-[13px] text-white/70">{her.charAt(0).toUpperCase() + her.slice(1)} usual heart rate at night</p>
              <p className="tnum text-[20px] font-semibold">
                {s.timeline.baseline_band.rhr[0].toFixed(0)} to {s.timeline.baseline_band.rhr[1].toFixed(0)} bpm
              </p>
            </li>
            <li>
              <p className="text-[13px] text-white/70">Chance of a strain episode in 72 hours</p>
              <p className="tnum text-[20px] font-semibold">
                {fmtPct(f.probability_72h)} <span className="text-[15px] font-normal text-white/70">likely {fmtPct(f.band_72h[0])} to {fmtPct(f.band_72h[1])}</span>
              </p>
            </li>
            {best && (
              <li>
                <p className="text-[13px] text-white/70">What helps {her} most</p>
                <p className="text-[16px] font-medium leading-snug">{best.plain.replace(/^Walking is [^.]+\.\s*/, '').replace(/^Sleep is [^.]+\.\s*/, '')}</p>
              </li>
            )}
          </ul>
        </div>
        <StreamColumn stream="wearable" title="Wearable" sub="Hourly sync, heart rate every 5 minutes" items={wear} />
      </div>
    </Section>
  )
}

function StreamColumn({ stream, title, sub, items }: { stream: 'record' | 'wearable'; title: string; sub: string; items: [GlyphName, string, string][] }) {
  const record = stream === 'record'
  return (
    <div className={cn('rounded-panel p-5 md:p-6', record ? 'bg-sandalwood-soft' : 'bg-peacock-soft')}>
      <div className="flex items-center gap-2.5">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-full bg-surface', record ? 'text-sandalwood' : 'text-peacock')}>
          <Glyph name={record ? 'record' : 'live'} size={20} tone="current" />
        </span>
        <div>
          <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
          <p className="text-[13px] text-ink-2">{sub}</p>
        </div>
      </div>
      <ul className="mt-5 divide-y divide-line">
        {items.map(([g, label, value]) => (
          <li key={label} className="flex items-start gap-3 py-3">
            <Glyph name={g} size={18} tone="identity" className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] text-ink-2">{label}</p>
              <p className="text-[15px] leading-snug text-ink tnum">{value}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CheapWatch() {
  const facts = [
    { big: '91.6%', label: 'of smartwatches sold in India cost under US$50.', body: 'The twin is tuned for their optical sensors and patchy wear, not for a clinical device.' },
    { big: 'Hourly', label: 'sync, not real time.', body: 'Each night is scored on whatever has arrived, and every screen says how fresh the data is.' },
    { big: '4 signals', label: 'are enough: heart rate, sleep, steps and a home BP reading.', body: 'HRV, SpO2 and breathing rate help when the watch has them. None of them is required.' },
  ]
  return (
    <Section title="Built for the watch India already wears" body="Most people in India will never wear a premium watch. Pratibimb works with the Noise, boAt and Fire-Boltt watches already on wrists, once-an-hour uploads, and a BP cuff at home.">
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <dl className="divide-y divide-line border-y border-line">
          {facts.map((f) => (
            <div key={f.big} className="grid gap-2 py-6 sm:grid-cols-[180px_1fr] sm:gap-8">
              <dt className="tnum text-[40px] font-650 leading-none tracking-[-0.035em] text-peacock-deep">{f.big}</dt>
              <dd>
                <p className="text-[17px] font-semibold leading-snug text-ink">{f.label}</p>
                <p className="mt-1 text-[15px] leading-6 text-ink-2">{f.body}</p>
              </dd>
            </div>
          ))}
        </dl>
        <div className="self-start rounded-panel border border-line bg-surface p-6">
          <p className="text-[14px] font-semibold text-ink">Every card says how fresh its data is</p>
          <ul className="mt-4 space-y-3 text-[15px]">
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-leaf" aria-hidden /> Synced 47 min ago
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-turmeric" aria-hidden /> Last synced 9 h ago
            </li>
            <li className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-stone" aria-hidden /> Offline since 10 Oct, 21:00
            </li>
          </ul>
          <p className="mt-5 border-t border-line pt-4 text-[14px] leading-6 text-ink-2">Real devices connect through Health Connect on Android and HealthKit on iPhone, with a CSV upload for everything else.</p>
        </div>
      </div>
    </Section>
  )
}

function Physiology({ s }: { s: Snapshot }) {
  const ph = s.physiology
  const first = s.patient.name.split(' ')[0]
  const shown = useMemo(() => {
    const best = ph.best_lever?.key
    return [...ph.responses].sort((a, b) => (a.key === best ? -1 : b.key === best ? 1 : 0)).slice(0, 2)
  }, [ph])
  const top = shown[0]
  return (
    <Section
      title="It learns how your body responds"
      body="On calm days the twin measures how much a walk or an extra hour of sleep moves this person's own numbers, then leans toward the average until the evidence is strong. The plan starts with what works for them."
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <div className="space-y-4 text-[17px] leading-[1.6] text-ink">
          {top && (
            <p>
              {first}'s {top.outcome === 'sbp' ? 'BP' : 'heart rate'} responds to {top.lever_label.toLowerCase()} <span className="tnum font-semibold">{top.relative_to_cohort.toFixed(1)} times</span> as much as most people's.
            </p>
          )}
          {ph.best_lever && <p className="text-ink-2">{ph.best_lever.plain}</p>}
          <p className="text-[15px] text-ink-2">
            Learned from <span className="tnum">{ph.calm_days_used}</span> calm days. Each estimate carries its interval and a plain word for the evidence behind it.
          </p>
        </div>
        <div className="panel divide-y divide-line px-6">
          {shown.map((r) => (
            <div key={r.key} className="py-5">
              <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Glyph name={r.lever === 'sleep' ? 'sleep' : 'steps'} size={18} tone="identity" />
                {r.lever_label} to {r.outcome_label.charAt(0).toLowerCase() + r.outcome_label.slice(1)}
              </p>
              <div className="mt-3">
                <PhysiologyDotFluid r={r} name={first} height={36} />
              </div>
              <p className="mt-2 text-[14px] leading-5 text-ink-2">{r.plain}</p>
            </div>
          ))}
          <p className="flex flex-wrap gap-x-5 gap-y-1 py-4 text-[13px] text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-lotus" aria-hidden /> {first}, with interval
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-[2px] rounded-full bg-ink-2" aria-hidden /> Most people
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-0 border-l border-dashed border-ink-3" aria-hidden /> No effect
            </span>
          </p>
        </div>
      </div>
    </Section>
  )
}

function Honest({ s }: { s: Snapshot }) {
  const b = s.budget
  const f = s.forecast
  const acc = f.twin_accuracy_7d
  const scale = Math.max(b.target_false_alerts_per_patient_day, b.observed_rate) * 1.4
  const fused = s.model.metrics.fused
  return (
    <Section title="Honest about what it knows" body="A number is only useful if the doctor knows how far to trust it. Every alert sits inside a budget, every chance comes with its range, and the twin reports how well it has been predicting this person.">
      <div className="grid gap-8 border-y border-line py-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
        <div className="md:pr-8">
          <p className="text-[15px] font-semibold text-ink">A false-alert budget</p>
          <div className="relative mt-5 h-2.5 rounded-full bg-mist-deep" aria-hidden>
            <span className="absolute inset-y-0 left-0 rounded-full bg-peacock" style={{ width: `${(b.observed_rate / scale) * 100}%` }} />
            <span className="absolute -top-1.5 h-[22px] w-[2px] rounded-full bg-ink" style={{ left: `${(b.target_false_alerts_per_patient_day / scale) * 100}%` }} />
          </div>
          <p className="mt-4 text-[15px] leading-6 text-ink-2">
            <span className="tnum font-semibold text-ink">{b.observed_rate.toFixed(3)}</span> false alerts a patient-day this week, against a budget of <span className="tnum">{b.target_false_alerts_per_patient_day.toFixed(3)}</span>.
          </p>
        </div>
        <div className="md:px-8">
          <p className="text-[15px] font-semibold text-ink">A range, never a single number</p>
          <p className="mt-3 tnum text-[34px] font-650 leading-none tracking-[-0.03em] text-ink">
            {fmtPct(f.probability_72h)}
            <span className="ml-2 text-[15px] font-normal tracking-normal text-ink-2">
              likely {fmtPct(f.band_72h[0])} to {fmtPct(f.band_72h[1])}
            </span>
          </p>
          <p className="mt-4 text-[15px] leading-6 text-ink-2">
            Five models vote. It warns a median of <span className="tnum font-semibold text-ink">{fused.median_lead_hours ?? 48} hours</span> ahead and catches <span className="tnum font-semibold text-ink">{fmtPct(fused.sensitivity ?? 0)}</span> of episodes at the budget.
          </p>
        </div>
        <div className="md:pl-8">
          <p className="text-[15px] font-semibold text-ink">How well it knows this person</p>
          <p className="mt-3 text-[34px] font-650 capitalize leading-none tracking-[-0.03em] text-ink">{acc.label}</p>
          <p className="mt-4 text-[15px] leading-6 text-ink-2">
            Off by <span className="tnum font-semibold text-ink">{acc.rhr_mae} bpm</span> on average over the last week. With fewer than 14 nights, urgent alerts stay off and the twin says so.
          </p>
        </div>
      </div>
    </Section>
  )
}

function Ladder() {
  const steps = [
    { title: 'The person', timing: '60 seconds', body: 'A full-screen check with sound and vibration. One tap says I am OK.' },
    { title: 'First contact', timing: 'after 60 seconds', body: 'SMS with the service header, a WhatsApp message and a voice call, with the location.' },
    { title: 'Second contact', timing: '2 minutes later', body: 'The same, to the next person who agreed to be called.' },
    { title: 'Doctor', timing: 'replies within 60 minutes', body: 'The clinician is alerted with the twin open at the right day.' },
  ]
  return (
    <Section title="When something is wrong, people come first" body="When the watch, the twin or the person says something is wrong, nobody waits on a dashboard. The check-in ladder climbs on its own and stops the moment someone answers.">
      <ol className="grid gap-x-6 gap-y-8 md:grid-cols-4">
        {steps.map((st, i) => (
          <li key={st.title} className="relative">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-white tnum dark:bg-surface-2">{i + 1}</span>
              {i < steps.length - 1 && <span className="hidden h-px flex-1 bg-line-strong md:block" aria-hidden />}
            </div>
            <p className="mt-4 text-[17px] font-semibold text-ink">{st.title}</p>
            <p className="text-[14px] font-medium text-peacock-deep">{st.timing}</p>
            <p className="mt-2 text-[15px] leading-6 text-ink-2">{st.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-10 flex max-w-2xl items-start gap-3 rounded-block bg-sindoor-soft px-5 py-4 text-[15px] leading-6 text-ink">
        <Glyph name="ladder" size={20} tone="current" className="mt-0.5 shrink-0 text-sindoor" />
        <span>
          <span className="font-semibold">Call 112 is one tap on every screen of the ladder.</span> The ladder never replaces emergency services, and every message it sends is written to the audit log.
        </span>
      </p>
    </Section>
  )
}

function Safe() {
  const items: { glyph?: GlyphName; title: string; body: string }[] = [
    { glyph: 'consent', title: 'Consent for each stream', body: 'Health record, watch data, predictions and emergency contacts are four separate switches.' },
    { glyph: 'twin', title: 'Opt out of AI predictions', body: 'Switching predictions off hides the score everywhere. The doctor still sees the readings.' },
    { glyph: 'consent', title: 'Ready for the DPDP Act', body: 'Purpose-bound use, a grievance officer, and withdrawal with deletion, ahead of May 2027.' },
    { glyph: 'doctor', title: 'Honest about regulation', body: 'A research proof of concept. A production version would be medical device software under CDSCO, likely class B or C.' },
    { glyph: 'record', title: 'ABDM WellnessRecord export', body: 'One download gives a FHIR R4 bundle with LOINC-coded readings that a health record app can read.' },
    { title: 'An audit log for everything', body: 'Every score, alert, message and consent change, with the consent it relied on.' },
  ]
  return (
    <Section title="Safe by design" body="The parts that make a health product safe to use are built into the screens, not added for a review.">
      <ul className="grid gap-x-12 md:grid-cols-2">
        {items.map((it) => (
          <li key={it.title} className="flex gap-4 border-t border-line py-5">
            <span className="mt-0.5 shrink-0 text-ink-2">{it.glyph ? <Glyph name={it.glyph} size={22} tone="identity" /> : <ScrollText className="h-[22px] w-[22px]" strokeWidth={1.7} aria-hidden />}</span>
            <div>
              <p className="text-[16px] font-semibold text-ink">{it.title}</p>
              <p className="mt-1 text-[15px] leading-6 text-ink-2">{it.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Evaluators() {
  return (
    <section className="mx-auto max-w-landing px-4 pb-20 md:px-6">
      <div className="flex flex-col items-start gap-6 rounded-panel bg-peacock-soft px-6 py-8 md:flex-row md:items-center md:justify-between md:px-10 md:py-10">
        <div className="max-w-xl">
          <h2 className="text-[26px] font-650 leading-tight tracking-[-0.02em] text-ink">For evaluators</h2>
          <p className="mt-2 text-[16px] leading-[1.6] text-ink-2">A guide written for the judges: each requirement in the brief, the screen that shows it, the code behind it and the number that proves it. Plus a five-minute tour.</p>
        </div>
        <RouteButton to="/guide" size="lg" className="shrink-0">
          Open the evaluator guide
        </RouteButton>
      </div>
    </section>
  )
}
