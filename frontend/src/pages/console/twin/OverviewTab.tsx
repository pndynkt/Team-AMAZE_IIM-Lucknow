import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { api } from '@/api/client'
import { useApi } from '@/api/hooks'
import type { Contributor, Physiology, PhysiologyResponse } from '@/api/types'
import { Glyph, type GlyphName } from '@/brand'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { NsState } from '@/components/ui/TierChip'
import { Stat } from '@/components/ui/Stat'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { LoadProblem } from '@/components/ui/States'
import { StreamTag } from '@/components/domain/StreamTag'
import { PhysiologyDotFluid, EVIDENCE_WORD } from '@/components/domain/PhysiologyDot'
import { ForecastMini } from '@/charts/ForecastMini'
import { fmtDayLong, fmtPct, fmtSigned } from '@/lib/format'
import { cn } from '@/lib/cn'
import { firstName, usualLabel, type OverviewProps } from './shared'

export default function OverviewTab({ id, patient, forecast, explain, physiology, onTab }: OverviewProps) {
  const p = patient.data
  const f = forecast.data
  const x = explain.data
  const timeline = useApi(() => api.timeline(id, 30), [id])
  const band = timeline.data?.baseline_band
  const usual = usualLabel(p)
  const first = firstName(p)

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-7">
        {explain.error && !x ? (
          <LoadProblem error={explain.error} what="The explanation" onRetry={explain.refetch} />
        ) : !x ? (
          <SkeletonCard rows={7} />
        ) : (
          <Panel title="Why the twin thinks so" subtitle="What moved the risk, grouped by the stream it came from. Longer bars moved it more.">
            <WhyGroup stream="wearable" items={x.contributors.filter((c) => c.group === 'wearable')} max={maxShap(x.contributors)} />
            <WhyGroup stream="record" items={x.contributors.filter((c) => c.group === 'ehr')} max={maxShap(x.contributors)} className="mt-5" />
            {x.protective.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-[13px] font-medium text-ink-2">Working in {first}'s favour</p>
                <ul className="flex flex-wrap gap-1.5">
                  {x.protective.map((c) => (
                    <li key={c.feature}>
                      <StreamTag stream={c.group === 'ehr' ? 'record' : 'wearable'}>{c.label}</StreamTag>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-start justify-between gap-3 border-t border-line pt-4">
              <div className="min-w-0 text-[13px] leading-5 text-ink-2">
                <p className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium text-ink">Overnight heart-rate rule</span>
                  <NsState state={x.rule_state.ns_state} nights={x.rule_state.days_in_state} />
                </p>
                <p className="mt-0.5 max-w-[60ch]">{x.rule_state.rule}</p>
                {x.stale_inputs.length > 0 && <p className="mt-1 font-medium text-turmeric">Some inputs are out of date: {x.stale_inputs.join(', ')}.</p>}
              </div>
              <Button size="sm" variant="secondary" onClick={() => onTab('twin')}>
                Open the twin charts
              </Button>
            </div>
          </Panel>
        )}

        {forecast.error && !f ? (
          <LoadProblem error={forecast.error} what="The forecast" onRetry={forecast.refetch} />
        ) : !f ? (
          <SkeletonCard rows={6} />
        ) : (
          <Panel title="Next 72 hours" subtitle={`Measured, then the forecast with its likely range. The grey band is ${usual.toLowerCase()}.`}>
            <div className="grid gap-6 md:grid-cols-2">
              <MiniBlock glyph="heart" title="Overnight resting heart rate" unit="bpm" next={f.rhr[0]} decimals={0}>
                <ForecastMini history={f.history.map((h) => ({ date: h.date, value: h.rhr }))} forecast={f.rhr} band={band?.rhr} bandLabel={usual} unit="bpm" decimals={1} height={168} label={`Overnight resting heart rate for ${first}, last week and the next three days`} />
              </MiniBlock>
              <MiniBlock glyph="bp" title="Morning systolic BP" unit="mmHg" next={f.sbp[0]} decimals={0}>
                <ForecastMini history={f.history.map((h) => ({ date: h.date, value: h.sbp }))} forecast={f.sbp} band={band?.sbp} bandLabel={usual} unit="mmHg" height={168} label={`Home systolic blood pressure for ${first}, last week and the next three days`} />
              </MiniBlock>
            </div>
            <div className="mt-6 grid gap-6 border-t border-line pt-5 md:grid-cols-2">
              <div>
                <p className="mb-2.5 text-[13px] font-medium text-ink-2">Chance of a strain episode, by day</p>
                <ul className="space-y-2.5">
                  {f.episode_probability.map((d) => (
                    <li key={d.date} className="grid grid-cols-[84px_1fr_auto] items-center gap-3 text-[13px]">
                      <span className="text-ink-2">{fmtDayLong(d.date)}</span>
                      <span className="relative h-2 rounded-full bg-mist-deep" aria-hidden>
                        <span className="absolute inset-y-0 rounded-full bg-peacock/30" style={{ left: `${d.band[0] * 100}%`, width: `${(d.band[1] - d.band[0]) * 100}%` }} />
                        <span className="absolute -top-[3px] h-[14px] w-[3px] -translate-x-1/2 rounded-full bg-ink" style={{ left: `${d.p * 100}%` }} />
                      </span>
                      <span className="tnum text-right">
                        <span className="font-semibold text-ink">{fmtPct(d.p)}</span>
                        <span className="text-ink-3">
                          {' '}
                          {fmtPct(d.band[0])} to {fmtPct(d.band[1])}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-[13.5px] leading-[1.55] text-ink-2">
                <p className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-ink-2">
                  How well the twin knows {first}
                  <Chip tone={f.twin_accuracy_7d.label === 'good' ? 'leaf' : f.twin_accuracy_7d.label === 'fair' ? 'turmeric' : 'sindoor'}>{f.twin_accuracy_7d.label === 'good' ? 'Good' : f.twin_accuracy_7d.label === 'fair' ? 'Fair' : 'Poor'}</Chip>
                </p>
                <p>
                  Over the last 7 days its forecasts were off by <span className="tnum font-medium text-ink">{f.twin_accuracy_7d.rhr_mae} bpm</span> for heart rate and <span className="tnum font-medium text-ink">{f.twin_accuracy_7d.sbp_mae} mmHg</span> for BP on average, and{' '}
                  <span className="tnum font-medium text-ink">{fmtPct(f.twin_accuracy_7d.coverage_p10_p90)}</span> of readings fell inside the likely range.
                </p>
              </div>
            </div>
          </Panel>
        )}
        {!p ? (
          <SkeletonCard rows={6} />
        ) : (
          <Panel tone="quiet" title="Static risk and baselines" subtitle="From the health record and from the person's own past nights. Changes slowly." className="bg-surface/60">
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3">
              <Stat
                label="Framingham, 10-year"
                value={`${p.static_risk.framingham_10y_pct.toFixed(1)}%`}
                size="sm"
                tone={p.static_risk.label === 'high' ? 'sindoor' : p.static_risk.label === 'intermediate' ? 'turmeric' : 'leaf'}
                hint={<span className="capitalize">{p.static_risk.label}</span>}
              />
              <Stat label="Polygenic risk tier" value={<span className="capitalize">{p.ehr.genetics.polygenic_risk_tier}</span>} size="sm" hint="Simulated" />
              <Stat label="Resting heart rate, 28-night median" value={p.baselines.rhr_28d_median.toFixed(1)} unit="bpm" size="sm" />
              <Stat label="Home systolic BP, 28-day mean" value={p.baselines.sbp_28d_mean.toFixed(1)} unit="mmHg" size="sm" />
              <Stat label="HRV, 60-night mean" value={p.baselines.lnrmssd_60d_mean.toFixed(2)} unit="lnRMSSD" size="sm" hint={`Smallest change that matters ${p.baselines.lnrmssd_swc.toFixed(2)}`} />
              <Stat label="Nights the twin has" value={p.baselines.nights_available} size="sm" hint={p.baselines.nights_available < 14 ? 'Urgent alerts need 14' : 'Enough for urgent alerts'} />
            </div>
            <p className="mt-5 flex items-start gap-2 text-[13px] leading-5 text-ink-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden /> {p.static_risk.south_asian_note}
            </p>
          </Panel>
        )}
      </div>

      <div className="space-y-5 xl:col-span-5">
        <PhysiologyPanel physiology={physiology} first={first} onSimulate={() => onTab('simulate')} />
      </div>
    </div>
  )
}

function maxShap(cs: Contributor[]): number {
  return Math.max(0.01, ...cs.map((c) => Math.abs(c.shap)))
}

function WhyGroup({ stream, items, max, className }: { stream: 'wearable' | 'record'; items: Contributor[]; max: number; className?: string }) {
  if (!items.length) return null
  return (
    <div className={className}>
      <StreamTag stream={stream} className="mb-2.5" />
      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c.feature} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-4">
            <span className="text-[14px] leading-5 text-ink">{c.label}</span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-mist-deep" aria-hidden>
                <span className={cn('block h-full rounded-full', stream === 'record' ? 'bg-sandalwood' : 'bg-peacock')} style={{ width: `${Math.min(100, (Math.abs(c.shap) / max) * 100)}%` }} />
              </span>
              <span className="sr-only">{c.direction === 'up' ? 'raises risk' : 'lowers risk'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MiniBlock({ glyph, title, unit, next, decimals, children }: { glyph: GlyphName; title: string; unit: string; next?: { p10: number; p50: number; p90: number }; decimals: number; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
        <Glyph name={glyph} size={16} tone="identity" /> {title}
      </p>
      {next && (
        <p className="mb-2 mt-0.5 text-[13px] text-ink-2">
          Tomorrow <span className="tnum font-semibold text-ink">{next.p50.toFixed(decimals)} {unit}</span>, likely{' '}
          <span className="tnum">
            {next.p10.toFixed(decimals)} to {next.p90.toFixed(decimals)}
          </span>
        </p>
      )}
      {children}
    </div>
  )
}

const LEVER_GLYPH: Record<string, GlyphName> = { walking: 'steps', sleep: 'sleep', medication: 'medicine' }

function PhysiologyPanel({ physiology, first, onSimulate }: { physiology: OverviewProps['physiology']; first: string; onSimulate: () => void }) {
  const ph = physiology.data
  const ordered = useMemo(() => {
    if (!ph) return []
    const best = ph.best_lever?.key
    return [...ph.responses].sort((a, b) => (a.key === best ? -1 : b.key === best ? 1 : 0))
  }, [ph])
  if (physiology.error && !ph) {
    return (
      <Panel title="Personal physiology" subtitle={`How ${first}'s body responds to sleep and walking.`}>
        <LoadProblem error={physiology.error} what="Personal physiology" onRetry={physiology.refetch} />
      </Panel>
    )
  }
  if (!ph) return <SkeletonCard rows={8} />
  return (
    <Panel title="Personal physiology" subtitle={<PhysSubtitle ph={ph} first={first} />}>
      {ph.best_lever && (
        <div className="mb-5 rounded-block bg-lotus-soft/70 p-4">
          <p className="text-[12.5px] font-semibold text-lotus-text">Strongest lever</p>
          <p className="mt-1 text-[14.5px] font-medium leading-snug text-ink">{ph.best_lever.plain}</p>
        </div>
      )}
      <ul className="divide-y divide-line">
        {ordered.map((r) => (
          <ResponseRow key={r.key} r={r} first={first} best={r.key === ph.best_lever?.key} />
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
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
        <Button size="sm" variant="secondary" onClick={onSimulate}>
          Try these in Simulate
        </Button>
      </div>
    </Panel>
  )
}

function PhysSubtitle({ ph, first }: { ph: Physiology; first: string }) {
  return (
    <>
      How {first}'s body responds, learned from <span className="tnum">{ph.calm_days_used}</span> calm days
      {ph.days_available >= ph.calm_days_used && (
        <>
          {' '}
          out of <span className="tnum">{ph.days_available}</span>
        </>
      )}{' '}
      and compared with most people.
    </>
  )
}

function ResponseRow({ r, first, best }: { r: PhysiologyResponse; first: string; best: boolean }) {
  const unit = r.unit === '% HRV' ? '%' : ` ${r.unit}`
  const rel = r.relative_to_cohort
  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <Glyph name={LEVER_GLYPH[r.lever] ?? 'twin'} size={16} tone="identity" />
          {r.lever_label} to {r.outcome_label.charAt(0).toLowerCase() + r.outcome_label.slice(1)}
        </p>
        <Chip tone={r.evidence === 'strong' ? 'leaf' : r.evidence === 'moderate' ? 'peacock' : 'stone'} className="shrink-0">
          {EVIDENCE_WORD[r.evidence]}
        </Chip>
      </div>
      <div className="mt-2">
        <PhysiologyDotFluid r={r} name={first} />
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-ink-2">{r.plain}</p>
      <p className="mt-1 text-[12.5px] tnum text-ink-3">
        {`${first} ${fmtSigned(r.personal, 2)} (${fmtSigned(r.interval[0], 2)} to ${fmtSigned(r.interval[1], 2)}), most people ${fmtSigned(r.cohort, 2)}${unit} per ${r.per}`}
        {Math.abs(rel - 1) >= 0.15 && <span className={cn(best ? 'font-medium text-lotus-text' : 'text-ink-2')}>{`, ${rel.toFixed(1)} times most people`}</span>}
      </p>
    </li>
  )
}
