import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { api } from '@/api/client'
import { useApi } from '@/api/hooks'
import type { Confidence, ThresholdPreview, Thresholds } from '@/api/types'
import { PageHeader } from '@/components/layout/ConsoleShell'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { fmtSigned } from '@/lib/format'
import { cn } from '@/lib/cn'

type NumKey = Exclude<keyof Thresholds, 'min_confidence_for_urgent'>

const GROUPS: { title: string; body: string; fields: { key: NumKey; label: string; hint: string; min: number; max: number; step: number; unit?: string }[] }[] = [
  {
    title: 'Risk score tiers',
    body: 'Where the 0 to 100 score turns into watch and urgent.',
    fields: [
      { key: 'watch', label: 'Watch starts at', hint: 'risk score', min: 10, max: 59, step: 1 },
      { key: 'urgent', label: 'Urgent starts at', hint: 'risk score', min: 40, max: 95, step: 1 },
    ],
  },
  {
    title: 'Overnight heart-rate rule',
    body: 'A NightSignal-style rule that runs beside the model, on resting heart rate above the person\'s own 28-night median.',
    fields: [
      { key: 'ns_rhr_delta_yellow', label: 'Yellow at', hint: 'above usual', min: 1, max: 8, step: 0.5, unit: 'bpm' },
      { key: 'ns_rhr_delta_red', label: 'Red at', hint: 'above usual', min: 2, max: 12, step: 0.5, unit: 'bpm' },
      { key: 'ns_consecutive_nights', label: 'Nights in a row for red', hint: 'at or above the red level', min: 1, max: 5, step: 1 },
      { key: 'hrv_swc_multiplier', label: 'HRV change that matters', hint: 'share of the night-to-night spread', min: 0.2, max: 1.0, step: 0.1 },
    ],
  },
]

export default function ThresholdsPage() {
  const toast = useToast()
  const current = useApi(() => api.thresholds(), [])
  const [draft, setDraft] = useState<Thresholds | null>(null)
  const [preview, setPreview] = useState<ThresholdPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (current.data && !draft) setDraft(current.data)
  }, [current.data, draft])
  useEffect(() => {
    if (current.error) toast.error('Could not load the thresholds', current.refetch, current.error.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.error])

  const changed = useMemo(() => {
    if (!draft || !current.data) return {} as Partial<Thresholds>
    const out: Partial<Thresholds> = {}
    for (const k of Object.keys(draft) as (keyof Thresholds)[]) {
      if (draft[k] !== current.data[k]) (out as Record<string, unknown>)[k] = draft[k]
    }
    return out
  }, [draft, current.data])
  const dirty = Object.keys(changed).length > 0

  useEffect(() => {
    if (!draft || !current.data) return
    const n = ++seq.current
    setPreviewing(true)
    const t = window.setTimeout(async () => {
      try {
        const r = await api.previewThresholds(dirty ? changed : {})
        if (n === seq.current) setPreview(r)
      } catch (e) {
        if (n === seq.current) toast.error('Could not replay the last 14 days', () => setDraft((d) => (d ? { ...d } : d)), e instanceof Error ? e.message : undefined)
      } finally {
        if (n === seq.current) setPreviewing(false)
      }
    }, 250)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const apply = async () => {
    if (!dirty) return
    setApplying(true)
    try {
      const next = await api.applyThresholds(changed)
      current.setData(next)
      setDraft(next)
      toast.success('New thresholds applied', 'Written to the audit log with every changed value.')
    } catch (e) {
      toast.error('Could not apply the thresholds', apply, e instanceof Error ? e.message : undefined)
    } finally {
      setApplying(false)
    }
  }

  const cur = current.data
  return (
    <div>
      <PageHeader
        title="Thresholds"
        subtitle="Try a change and see what it would have done over the last 14 days before anything changes for real."
        actions={
          <>
            <Button variant="quiet" size="sm" icon={<RotateCcw />} disabled={!dirty} onClick={() => cur && setDraft(cur)}>
              Discard changes
            </Button>
            <Button size="sm" icon={<Check />} loading={applying} disabled={!dirty} onClick={apply}>
              Apply changes
            </Button>
          </>
        }
      />

      {current.error && !cur ? (
        <ErrorState title="The thresholds did not load" body={current.error.message} onRetry={current.refetch} />
      ) : !cur || !draft ? (
        <div className="grid gap-5 xl:grid-cols-12">
          <SkeletonCard className="xl:col-span-7" rows={8} />
          <SkeletonCard className="xl:col-span-5" rows={6} />
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-12">
          <Panel className="xl:col-span-7" title="Draft" subtitle="For the whole cohort. Per-person settings are planned.">
            <div className="space-y-8">
              {GROUPS.map((g) => (
                <div key={g.title}>
                  <h3 className="text-[14.5px] font-semibold text-ink">{g.title}</h3>
                  <p className="mb-4 text-[13px] leading-5 text-ink-2">{g.body}</p>
                  <div className="space-y-5">
                    {g.fields.map((f) => {
                      const v = draft[f.key]
                      const was = cur[f.key]
                      const pct = ((v - f.min) / (f.max - f.min)) * 100
                      return (
                        <div key={f.key}>
                          <div className="mb-2 flex items-center justify-between gap-3 text-[14px]">
                            <label htmlFor={`th-${f.key}`} className="font-medium text-ink">
                              {f.label} <span className="ml-1 text-[13px] font-normal text-ink-2">{f.hint}</span>
                            </label>
                            <span className="flex items-center gap-1.5 tnum text-ink-2">
                              {v !== was && <span className="text-[12.5px] text-ink-3">was {was}</span>}
                              <input
                                type="number"
                                aria-label={`${f.label}, value`}
                                value={v}
                                min={f.min}
                                max={f.max}
                                step={f.step}
                                onChange={(e) => setDraft((d) => (d ? { ...d, [f.key]: Number(e.target.value) } : d))}
                                className={cn('field h-8 w-20 rounded-[10px] px-2 text-right text-[14px]', v !== was && 'border-peacock')}
                              />
                              <span className="w-8 text-[13px]" aria-hidden={!f.unit}>
                                {f.unit ?? ''}
                              </span>
                            </span>
                          </div>
                          <input id={`th-${f.key}`} type="range" min={f.min} max={f.max} step={f.step} value={v} onChange={(e) => setDraft((d) => (d ? { ...d, [f.key]: Number(e.target.value) } : d))} style={{ ['--pct' as string]: `${pct}%` }} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div>
                <h3 className="text-[14.5px] font-semibold text-ink">Confidence needed for an urgent alert</h3>
                <p className="mb-3 text-[13px] leading-5 text-ink-2">Below this, an urgent alert is shown as watch. Confidence is low when the twin has under 14 nights or its recent forecasts missed.</p>
                <div role="radiogroup" aria-label="Confidence needed" className="inline-flex rounded-control bg-ink/[0.055] p-[3px]">
                  {(['low', 'medium', 'high'] as Confidence[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={draft.min_confidence_for_urgent === c}
                      onClick={() => setDraft((d) => (d ? { ...d, min_confidence_for_urgent: c } : d))}
                      className={cn('h-8 rounded-[9px] px-3.5 text-[13.5px] font-medium capitalize transition-colors', draft.min_confidence_for_urgent === c ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(16,48,47,0.1)]' : 'text-ink-2 hover:text-ink')}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <section className="panel p-6 md:p-7 xl:sticky xl:top-6 xl:col-span-5" aria-live="polite">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold">The last 14 days, replayed</h2>
                <p className="mt-0.5 text-[13px] text-ink-2">{preview ? (preview.scope === 'cohort' ? 'Whole cohort, under the draft' : 'This person, under the draft') : 'Replaying'}</p>
              </div>
              <span className="text-[12.5px] text-ink-2">{previewing ? 'Updating' : dirty ? 'Draft' : 'No changes yet'}</span>
            </div>
            {!preview ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-16" />
                <Skeleton className="h-28" />
              </div>
            ) : (
              <div className={cn('transition-opacity', previewing && 'opacity-60')}>
                <p className="text-[17px] leading-[1.5] text-ink">
                  It would have fired <span className="tnum font-semibold">{preview.draft.alerts}</span> times <span className="text-ink-2">(now {preview.current.alerts})</span> and caught{' '}
                  <span className="tnum font-semibold">
                    {preview.draft.would_have_caught_events} of {preview.draft.events}
                  </span>{' '}
                  strain episodes <span className="text-ink-2">(now {preview.current.would_have_caught_events})</span>.
                </p>
                <table className="mt-5 w-full text-[14px]">
                  <thead>
                    <tr className="border-b border-line-strong text-left text-[12.5px] text-ink-2">
                      <th className="py-2 font-medium">Measure</th>
                      <th className="py-2 text-right font-medium">Now</th>
                      <th className="py-2 text-right font-medium">Draft</th>
                    </tr>
                  </thead>
                  <tbody className="tnum">
                    <CompareRow label="Alerts" a={preview.current.alerts} b={preview.draft.alerts} fmt={(v) => String(v)} lowerIsBetter />
                    <CompareRow label="Alerts a patient-day" a={preview.current.per_patient_day} b={preview.draft.per_patient_day} fmt={(v) => v.toFixed(4)} lowerIsBetter />
                    <CompareRow label="Episodes caught" a={preview.current.would_have_caught_events} b={preview.draft.would_have_caught_events} fmt={(v) => `${v} of ${preview.draft.events}`} />
                    <CompareRow label="Share caught" a={preview.current.would_have_caught_events / preview.current.events} b={preview.draft.would_have_caught_events / preview.draft.events} fmt={(v) => `${(v * 100).toFixed(0)}%`} />
                  </tbody>
                </table>
                <p className="mt-4 text-[13.5px] text-ink-2">
                  <span className="tnum font-medium text-ink">{fmtSigned(preview.delta_alerts_pct, 1, '%')}</span> alerts, <span className="tnum font-medium text-ink">{fmtSigned(preview.sensitivity_change * 100, 1)} points</span> of episodes caught.
                </p>
                <p className="mt-2 text-[13px] leading-5 text-ink-2">Applying writes an audit entry with every changed value. Alerts already raised stay as they are.</p>
                <Button className="mt-5 w-full" icon={<Check />} loading={applying} disabled={!dirty} onClick={apply}>
                  Apply changes
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function CompareRow({ label, a, b, fmt, lowerIsBetter }: { label: string; a: number; b: number; fmt: (v: number) => string; lowerIsBetter?: boolean }) {
  const better = lowerIsBetter ? b < a : b > a
  const worse = lowerIsBetter ? b > a : b < a
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-2.5 text-ink-2">{label}</td>
      <td className="py-2.5 text-right text-ink-2">{fmt(a)}</td>
      <td className={cn('py-2.5 text-right font-semibold', better ? 'text-leaf' : worse ? 'text-sindoor' : 'text-ink')}>{fmt(b)}</td>
    </tr>
  )
}
