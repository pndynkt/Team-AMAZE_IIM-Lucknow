import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { RotateCcw, Soup, Wine } from 'lucide-react'
import { api } from '@/api/client'
import type { LeverApplied, LeverEffect, SimulateBody, SimulateResponse, UsualWeek } from '@/api/types'
import { Glyph } from '@/brand'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { ForecastMini } from '@/charts/ForecastMini'
import { Swatch } from '@/charts/ChartTooltip'
import { fmtPct, fmtSigned } from '@/lib/format'
import { cn } from '@/lib/cn'
import { firstName, type SimulateTabProps } from './shared'

const ZERO: Required<SimulateBody> = { walk_minutes_per_day: 0, sleep_extra_hours: 0, bp_med_adherence_pct: 72, sodium_reduction: false, alcohol_free: false }

const LEVER_NAME: Record<keyof SimulateBody, (v: number | boolean) => string> = {
  walk_minutes_per_day: (v) => `Walk ${v} min a day`,
  sleep_extra_hours: (v) => `Sleep ${v} h more`,
  bp_med_adherence_pct: (v) => `BP medicine on ${v}% of days`,
  sodium_reduction: () => 'Less salt',
  alcohol_free: () => 'No alcohol',
}

export default function SimulateTab({ id, patient, forecast, physiology }: SimulateTabProps) {
  const toast = useToast()
  const p = patient.data
  const first = firstName(p)
  const currentAdh = useMemo(() => p?.ehr.medications.find((m) => ['CCB', 'ACEi', 'ARB', 'Beta blocker', 'Diuretic', 'Thiazide'].includes(m.class))?.adherence_30d_pct ?? 72, [p])
  const best = physiology.data?.best_lever?.lever
  const start = useMemo<Required<SimulateBody>>(() => ({ ...ZERO, bp_med_adherence_pct: currentAdh, walk_minutes_per_day: best === 'sleep' ? 0 : 30, sleep_extra_hours: best === 'sleep' ? 1 : 0 }), [currentAdh, best])
  const [levers, setLevers] = useState<Required<SimulateBody>>(start)
  const [result, setResult] = useState<SimulateResponse | null>(null)
  const [pending, setPending] = useState(false)
  const seq = useRef(0)

  useEffect(() => setLevers(start), [start])

  // Debounced re-run as the levers move.
  useEffect(() => {
    const n = ++seq.current
    setPending(true)
    const t = window.setTimeout(async () => {
      try {
        const body: SimulateBody = {}
        if (levers.walk_minutes_per_day > 0) body.walk_minutes_per_day = levers.walk_minutes_per_day
        if (levers.sleep_extra_hours > 0) body.sleep_extra_hours = levers.sleep_extra_hours
        if (levers.bp_med_adherence_pct !== currentAdh) body.bp_med_adherence_pct = levers.bp_med_adherence_pct
        if (levers.sodium_reduction) body.sodium_reduction = true
        if (levers.alcohol_free) body.alcohol_free = true
        const r = await api.simulate(id, body)
        if (n === seq.current) setResult(r)
      } catch (e) {
        if (n === seq.current) toast.error('Could not run this scenario', () => setLevers((l) => ({ ...l })), e instanceof Error ? e.message : undefined)
      } finally {
        if (n === seq.current) setPending(false)
      }
    }, 220)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levers, id, currentAdh])

  const f = forecast.data
  const reset = () => setLevers({ ...ZERO, bp_med_adherence_pct: currentAdh })
  const anyLever = levers.walk_minutes_per_day > 0 || levers.sleep_extra_hours > 0 || levers.bp_med_adherence_pct !== currentAdh || levers.sodium_reduction || levers.alcohol_free
  const personalised = !!result?.levers_applied.some((l) => l.personal_effect)

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="xl:col-span-4">
        <Panel
          title={`What if ${first} changes one thing`}
          subtitle={best ? `Starts on ${first}'s strongest lever. Move any of them and the twin re-runs.` : 'Move a lever and the twin re-runs.'}
          action={
            <Button size="sm" variant="quiet" icon={<RotateCcw />} onClick={reset} disabled={!anyLever}>
              Clear
            </Button>
          }
        >
          <div className="space-y-6">
            <Lever icon={<Glyph name="steps" size={18} tone="identity" />} label="Walking" value={`${levers.walk_minutes_per_day} min a day`} min={0} max={60} step={5} v={levers.walk_minutes_per_day} onChange={(v) => setLevers((l) => ({ ...l, walk_minutes_per_day: v }))} />
            <Lever icon={<Glyph name="sleep" size={18} tone="identity" />} label="Extra sleep" value={`${levers.sleep_extra_hours.toFixed(1)} h a night`} min={0} max={2} step={0.5} v={levers.sleep_extra_hours} onChange={(v) => setLevers((l) => ({ ...l, sleep_extra_hours: v }))} />
            <Lever icon={<Glyph name="medicine" size={18} tone="identity" />} label="BP medicine taken" value={`${levers.bp_med_adherence_pct}% of days`} hint={`now ${currentAdh}%`} min={50} max={100} step={1} v={levers.bp_med_adherence_pct} onChange={(v) => setLevers((l) => ({ ...l, bp_med_adherence_pct: v }))} />
            <div className="space-y-2">
              <Toggle icon={<Soup className="h-[18px] w-[18px] text-ink-2" strokeWidth={1.8} />} label="Less salt" hint="under 5 g a day" checked={levers.sodium_reduction} onChange={(v) => setLevers((l) => ({ ...l, sodium_reduction: v }))} />
              <Toggle icon={<Wine className="h-[18px] w-[18px] text-ink-2" strokeWidth={1.8} />} label="No alcohol" hint="for three evenings" checked={levers.alcohol_free} onChange={(v) => setLevers((l) => ({ ...l, alcohol_free: v }))} />
            </div>
          </div>
        </Panel>
      </div>

      <div className="space-y-5 xl:col-span-8">
        <section className="panel p-6 md:p-7" aria-live="polite" aria-busy={pending}>
          {!result ? (
            <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="col-span-full h-24" />
            </div>
          ) : (
            <div className={cn('transition-opacity duration-150', pending && 'opacity-60')}>
              <div className="grid gap-5 lg:grid-cols-2">
                <Next72 result={result} />
                <OrdinaryWeek week={result.usual_week ?? null} anyLever={result.levers_applied.length > 0} />
              </div>

              <div className="mt-7">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-ink">{personalised ? `For ${first}, and for most people` : 'Effect of each change'}</h3>
                  <span className="text-[12.5px] text-ink-2">Change by day 3, compared with no change</span>
                </div>
                {result.levers_applied.length === 0 ? (
                  <p className="rounded-block bg-surface-2 px-4 py-4 text-[14px] text-ink-2">Nothing is changed yet. Try 30 minutes of walking a day.</p>
                ) : personalised ? (
                  <PersonalTable levers={result.levers_applied} first={first} />
                ) : (
                  <ul className="space-y-1.5">
                    {result.levers_applied.map((l) => (
                      <li key={l.lever} className="rounded-block bg-surface-2 px-4 py-2.5 text-[14px] text-ink">
                        {l.effect}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="mt-4 max-w-[80ch] text-[13px] leading-5 text-ink-2">{result.note}</p>
            </div>
          )}
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <Panel title="Overnight resting heart rate" lead={<Glyph name="heart" size={18} tone="identity" />} subtitle={<ChartKey />}>
            {f && result ? <ForecastMini history={f.history.map((h) => ({ date: h.date, value: h.rhr }))} forecast={f.rhr} scenario={result.rhr} unit="bpm" decimals={1} height={180} label={`Heart rate forecast for ${first} as things are and with these changes`} /> : <Skeleton className="h-[180px]" />}
          </Panel>
          <Panel title="Morning systolic BP" lead={<Glyph name="bp" size={18} tone="identity" />} subtitle={<ChartKey />}>
            {f && result ? <ForecastMini history={f.history.map((h) => ({ date: h.date, value: h.sbp }))} forecast={f.sbp} scenario={result.sbp} unit="mmHg" height={180} label={`Blood pressure forecast for ${first} as things are and with these changes`} /> : <Skeleton className="h-[180px]" />}
          </Panel>
        </div>
      </div>
    </div>
  )
}

function ChartKey() {
  return (
    <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <Swatch color="var(--hex-ink-3)" dashed /> As things are
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch color="var(--hex-peacock)" dashed /> With these changes
      </span>
    </span>
  )
}

function effectText(e: LeverEffect | undefined): ReactNode {
  if (!e) return <span className="text-ink-3">Not given</span>
  const parts: string[] = []
  if (typeof e.sbp === 'number' && e.sbp !== 0) parts.push(`BP ${fmtSigned(e.sbp, 1)} mmHg`)
  if (typeof e.rhr === 'number' && e.rhr !== 0) parts.push(`heart rate ${fmtSigned(e.rhr, 1)} bpm`)
  if (typeof e.hrv_pct === 'number' && e.hrv_pct !== 0) parts.push(`HRV ${fmtSigned(e.hrv_pct, 0)}%`)
  return parts.length ? parts.join(', ') : 'No change'
}

function same(a?: LeverEffect, b?: LeverEffect) {
  return !!a && !!b && (a.sbp ?? 0) === (b.sbp ?? 0) && (a.rhr ?? 0) === (b.rhr ?? 0) && (a.hrv_pct ?? 0) === (b.hrv_pct ?? 0)
}

function PersonalTable({ levers, first }: { levers: LeverApplied[]; first: string }) {
  return (
    <div className="overflow-x-auto rounded-block border border-line">
      <table className="w-full min-w-[560px] text-[14px]">
        <thead>
          <tr className="text-left text-[12.5px] text-ink-2">
            <th scope="col" className="bg-surface-2 px-4 py-2.5 font-medium">
              Change
            </th>
            <th scope="col" className="bg-lotus-soft/60 px-4 py-2.5 font-semibold text-lotus-text">
              For {first}
            </th>
            <th scope="col" className="bg-surface-2 px-4 py-2.5 font-medium">
              For most people
            </th>
          </tr>
        </thead>
        <tbody>
          {levers.map((l) => {
            const eq = same(l.personal_effect, l.cohort_effect)
            return (
              <tr key={l.lever} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-ink">{LEVER_NAME[l.lever]?.(l.value) ?? l.lever}</td>
                <td className="bg-lotus-soft/25 px-4 py-3 tnum font-semibold text-ink">
                  {effectText(l.personal_effect)}
                  {eq && <span className="mt-0.5 block text-[12px] font-normal text-ink-2">No personal data for this change yet, so the twin uses the average.</span>}
                </td>
                <td className="px-4 py-3 tnum text-ink-2">{effectText(l.cohort_effect)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Lever({ icon, label, value, hint, min, max, step, v, onChange }: { icon: ReactNode; label: string; value: string; hint?: string; min: number; max: number; step: number; v: number; onChange: (v: number) => void }) {
  const pct = ((v - min) / (max - min)) * 100
  const id = `lever-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-2 text-[14px]">
        <label htmlFor={id} className="inline-flex items-center gap-2 font-medium text-ink">
          {icon} {label}
        </label>
        <span className="tnum text-ink">
          {value}
          {hint && <span className="ml-1.5 text-[12.5px] text-ink-3">{hint}</span>}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(Number(e.target.value))} style={{ ['--pct' as string]: `${pct}%` }} aria-valuetext={value} />
    </div>
  )
}

function Toggle({ icon, label, hint, checked, onChange }: { icon: ReactNode; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-control border border-line px-3.5 py-3 text-left transition-colors hover:bg-surface-2">
      <span className="inline-flex items-center gap-2.5 text-[14px]">
        {icon}
        <span>
          <span className="font-medium text-ink">{label}</span>
          {hint && <span className="ml-1.5 text-[12.5px] text-ink-3">{hint}</span>}
        </span>
      </span>
      <span className={cn('relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors', checked ? 'bg-peacock-deep' : 'bg-mist-deep')} aria-hidden>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-[0_1px_3px_rgba(16,48,47,0.25)] transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
    </button>
  )
}

function Next72({ result }: { result: SimulateResponse }) {
  const { baseline: b, scenario: sc, delta } = result
  const flat = Math.abs(delta.probability_72h) < 0.005
  return (
    <div className="rounded-block bg-surface-2 p-5">
      <p className="text-[14px] font-semibold text-ink">Next 72 hours</p>
      <p className="text-[13px] text-ink-2">Chance of a strain episode</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 tnum">
        <span className="text-[20px] font-medium text-ink-3">{fmtPct(b.probability_72h)}</span>
        <span className="text-[16px] text-ink-3" aria-hidden>
          to
        </span>
        <span className="text-[40px] font-650 leading-none tracking-[-0.04em] text-ink">{fmtPct(sc.probability_72h)}</span>
        <span className="text-[14px] font-medium text-ink-2">{flat ? 'about the same' : `${fmtSigned(Math.round(delta.probability_72h * 100))} points`}</span>
      </div>
      <p className="mt-1 text-[13px] tnum text-ink-2">
        Likely {fmtPct(sc.band[0])} to {fmtPct(sc.band[1])}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[13px]">
        <div>
          <dt className="text-ink-2">BP on day 3</dt>
          <dd className="tnum">
            <span className="text-[17px] font-semibold text-ink">{sc.sbp_p50_day3}</span> mmHg
            {delta.sbp_p50_day3 !== 0 && <span className="ml-1.5 font-medium text-ink">{fmtSigned(delta.sbp_p50_day3)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-ink-2">Heart rate on day 3</dt>
          <dd className="tnum">
            <span className="text-[17px] font-semibold text-ink">{sc.rhr_p50_day3.toFixed(1)}</span> bpm
            {delta.rhr_p50_day3 !== 0 && <span className="ml-1.5 font-medium text-ink">{fmtSigned(delta.rhr_p50_day3, 1)}</span>}
          </dd>
        </div>
      </dl>
      {flat && <p className="mt-3 text-[12.5px] leading-5 text-ink-2">A change now cannot undo strain that is already under way, so the next three days barely move.</p>}
    </div>
  )
}

function OrdinaryWeek({ week, anyLever }: { week: UsualWeek | null; anyLever: boolean }) {
  return (
    <div className="rounded-block bg-peacock-soft/60 p-5">
      <p className="text-[14px] font-semibold text-ink">On an ordinary week</p>
      <p className="text-[13px] text-ink-2">Chance of a strain episode, if the change is kept up</p>
      {week ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 tnum">
            <span className="text-[20px] font-medium text-ink-3">{fmtPct(week.baseline, 1)}</span>
            <span className="text-[16px] text-ink-3" aria-hidden>
              to
            </span>
            <span className="text-[40px] font-650 leading-none tracking-[-0.04em] text-peacock-deep dark:text-peacock">{fmtPct(week.scenario, 1)}</span>
            <span className="text-[14px] font-medium text-ink-2">{Math.abs(week.relative_change) < 0.03 ? 'about the same' : `${Math.abs(Math.round(week.relative_change * 100))}% ${week.relative_change < 0 ? 'lower' : 'higher'}`}</span>
          </div>
          <p className="mt-3 text-[14px] leading-[1.5] text-ink">{week.plain}</p>
        </>
      ) : (
        <p className="mt-3 text-[14px] leading-[1.5] text-ink-2">{anyLever ? 'The server did not estimate an ordinary week for this change.' : 'Move a lever to see what it does to an ordinary week.'}</p>
      )}
    </div>
  )
}
