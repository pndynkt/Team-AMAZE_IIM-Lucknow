import { useMemo, useState } from 'react'
import { Check, Phone } from 'lucide-react'
import { api, isNotAvailable } from '@/api/client'
import type { Explain, Forecast, Patient, TwinSummary } from '@/api/types'
import { Glyph } from '@/brand'
import { Button } from '@/components/ui/Button'
import { TierChip } from '@/components/ui/TierChip'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { STREAM_LABEL } from '@/components/domain/StreamTag'
import { useMeta } from '@/lib/meta'
import { useCountUp } from '@/lib/motion'
import { fmtPct, pronoun } from '@/lib/format'
import { cn } from '@/lib/cn'
import { openAlertOf, replaceAlert, type SummaryProps } from './shared'

/**
 * The twin summary: what the twin expects, why, the strongest lever and the suggested next step,
 * then the two streams it used. Built from GET /summary; when that is not on the server yet, the same
 * shape is assembled from the forecast and the explanation so the page still answers the question.
 */
export function TwinSummaryPanel({ id, patient, summary, forecast, explain, alerts, activeEscalation, onEscalated }: SummaryProps) {
  const p = patient.data
  const f = forecast.data
  const x = explain.data
  const s: TwinSummary | null = useMemo(() => {
    if (summary.data) return summary.data
    if (summary.error && isNotAvailable(summary.error) && p && f && x) return fallbackSummary(p, f, x)
    return null
  }, [summary.data, summary.error, p, f, x])

  if (!p || !s) {
    return (
      <div className="panel p-6 md:p-7" aria-busy="true">
        <Skeleton className="mb-4 h-6 w-28 rounded-full" />
        <Skeleton className="mb-4 h-8 w-2/3" />
        <SkeletonText lines={3} />
      </div>
    )
  }
  const tier = s.tier === 'opted_out' ? 'opted_out' : p.current.tier
  const prob = f?.probability_72h ?? p.current.probability_72h
  const band = f?.band_72h ?? p.current.probability_band
  const optedOut = tier === 'opted_out'

  return (
    <section className="panel overflow-hidden" aria-labelledby="summary-headline">
      <div className="grid gap-8 p-6 md:p-7 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <TierChip tier={tier} size="md" />
          <h2 id="summary-headline" className="mt-3 text-[26px] font-650 leading-[1.18] tracking-[-0.02em] text-ink">
            {s.headline}
          </h2>
          <div className="mt-3 max-w-[64ch] space-y-2 text-[16px] leading-[1.6] text-ink">
            {s.sentences.map((t, i) => (
              <p key={i} className={cn(i > 0 && 'text-ink-2')}>
                {t}
              </p>
            ))}
          </div>
          <NextStep id={id} p={p} step={s.next_step} alerts={alerts} activeEscalation={!!activeEscalation} onEscalated={onEscalated} />
        </div>

        {!optedOut && (
          <aside className="border-line lg:border-l lg:pl-8" aria-label="Chance of a strain episode">
            <Probability prob={prob} band={band} usual={s.usual_probability || x?.base_rate || null} sex={p.sex} />
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-[13px]">
              <div>
                <dt className="text-ink-2">Risk score</dt>
                <dd className="mt-0.5 tnum text-[17px] font-semibold text-ink">
                  {p.current.risk_score ?? '--'}
                  <span className="text-[13px] font-normal text-ink-3"> of 100</span>
                </dd>
              </div>
              <div>
                <dt className="text-ink-2">Confidence</dt>
                <dd className="mt-0.5 text-[17px] font-semibold capitalize text-ink">{f?.confidence ?? p.current.confidence ?? 'unknown'}</dd>
              </div>
            </dl>
          </aside>
        )}
      </div>

      <div className="border-t border-line bg-surface-2/70 px-6 py-4 md:px-7">
        <p className="mb-2.5 text-[13px] font-medium text-ink-2">What the twin used</p>
        <div className="space-y-2.5">
          <StreamLine stream="record" items={s.streams.record} />
          <StreamLine stream="wearable" items={s.streams.wearable} />
        </div>
      </div>
    </section>
  )
}

function Probability({ prob, band, usual, sex }: { prob: number; band: [number, number]; usual: number | null; sex: Patient['sex'] }) {
  const shown = useCountUp(Math.round(prob * 100))
  const max = Math.max(0.5, Math.ceil(Math.max(band[1], prob) * 10) / 10)
  const pos = (v: number) => `${(v / max) * 100}%`
  const her = pronoun(sex).her
  return (
    <div>
      <p className="text-[13.5px] font-medium text-ink">Chance of a strain episode</p>
      <p className="text-[13px] text-ink-2">in the next 72 hours</p>
      <p className="mt-2 tnum text-[56px] font-650 leading-none tracking-[-0.045em] text-ink" aria-label={`${Math.round(prob * 100)} percent`}>
        {shown}
        <span className="text-[30px] tracking-[-0.02em]">%</span>
      </p>
      <div className="relative mt-4 h-2 rounded-full bg-mist-deep" aria-hidden>
        <span className="absolute inset-y-0 rounded-full bg-peacock/35" style={{ left: pos(band[0]), width: `calc(${pos(band[1])} - ${pos(band[0])})` }} />
        <span className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded-full bg-ink" style={{ left: pos(prob) }} />
        {usual !== null && <span className="absolute -top-0.5 h-3 w-[2px] -translate-x-1/2 rounded-full bg-ink-3" style={{ left: pos(usual) }} />}
      </div>
      <p className="mt-2.5 text-[13px] leading-5 text-ink-2">
        Likely between <span className="tnum font-medium text-ink">{fmtPct(band[0])}</span> and <span className="tnum font-medium text-ink">{fmtPct(band[1])}</span>.
        {usual !== null && (
          <>
            {' '}
            {her.charAt(0).toUpperCase() + her.slice(1)} usual is <span className="tnum font-medium text-ink">{fmtPct(usual)}</span>.
          </>
        )}
      </p>
    </div>
  )
}

function StreamLine({ stream, items }: { stream: 'record' | 'wearable'; items: string[] }) {
  const record = stream === 'record'
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className={cn('mt-0.5 inline-flex w-[132px] shrink-0 items-center gap-1.5 text-[13px] font-semibold', record ? 'text-sandalwood-text' : 'text-peacock-deep dark:text-peacock')}>
        <Glyph name={record ? 'record' : 'live'} size={16} tone="current" />
        {STREAM_LABEL[stream]}
      </span>
      <ul className="flex min-w-0 flex-wrap gap-1.5">
        {items.map((t) => (
          <li key={t} className={cn('rounded-full px-2 py-0.5 text-[12.5px]', record ? 'bg-sandalwood-soft text-ink' : 'bg-peacock-soft text-ink')}>
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}

function NextStep({ id, p, step, alerts, activeEscalation, onEscalated }: { id: string; p: Patient; step: string; alerts: SummaryProps['alerts']; activeEscalation: boolean; onEscalated: () => void }) {
  const toast = useToast()
  const { clinician, meta } = useMeta()
  const [busy, setBusy] = useState<'ack' | 'call' | 'escalate' | null>(null)
  const open = openAlertOf(alerts.data)
  const first = p.name.split(' ')[0]

  const ack = async () => {
    if (!open) return
    setBusy('ack')
    try {
      const res = await api.ackAlert(open.id, { by: clinician, note: 'Acknowledged from the twin summary' })
      alerts.setData((prev) => replaceAlert(prev, res))
      toast.success(`Acknowledged for ${first}`, 'Written to the audit log.')
    } catch (e) {
      toast.error('Could not acknowledge', ack, e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }
  const logCall = async () => {
    setBusy('call')
    try {
      await api.annotatePatient(id, { date: meta.as_of, kind: 'note', label: `Called ${first} from the twin summary`, by: clinician })
      toast.success('Call logged', `A note is on ${first}'s timeline for today.`)
    } catch (e) {
      toast.error('Could not log the call', logCall, e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }
  const escalate = async () => {
    setBusy('escalate')
    try {
      if (open) {
        const es = await api.escalateAlert(open.id, { by: clinician, reason: 'Escalated from the twin summary' })
        alerts.setData((prev) => replaceAlert(prev, { ...open, status: 'escalated', escalation_id: es.id }))
      } else {
        await api.createEscalation({ patient_id: id, trigger: 'clinician', by: clinician, alert_id: null })
        void alerts.refetch()
      }
      toast.info('Escalation started', `The first of ${first}'s contacts is being reached.`)
      onEscalated()
    } catch (e) {
      toast.error('Could not start the escalation', escalate, e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-6 rounded-block border border-line bg-surface-2 p-4 md:p-5">
      <p className="text-[13px] font-medium text-ink-2">Suggested next step</p>
      <p className="mt-1 max-w-[64ch] text-[15.5px] font-semibold leading-snug text-ink">{step}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {open?.status === 'open' ? (
          <Button onClick={ack} loading={busy === 'ack'} icon={<Check />}>
            Acknowledge
          </Button>
        ) : open?.acknowledged_by ? (
          <span className="inline-flex h-10 items-center gap-1.5 px-1 text-[13.5px] text-ink-2">
            <Check className="h-4 w-4 text-leaf" aria-hidden /> Acknowledged by {open.acknowledged_by}
          </span>
        ) : null}
        <Button variant="secondary" onClick={logCall} loading={busy === 'call'} icon={<Phone />}>
          Log a call
        </Button>
        {activeEscalation ? (
          <span className="inline-flex h-10 items-center gap-1.5 px-1 text-[13.5px] font-medium text-sindoor">
            <Glyph name="ladder" size={16} tone="current" /> Escalation in progress
          </span>
        ) : (
          <Button variant="danger" onClick={escalate} loading={busy === 'escalate'} icon={<Glyph name="ladder" size={16} tone="current" />}>
            Escalate
          </Button>
        )}
      </div>
    </div>
  )
}

/** Same shape as GET /summary, assembled from the v1 endpoints while the server does not have it yet. */
function fallbackSummary(p: Patient, f: Forecast, x: Explain): TwinSummary {
  const first = p.name.split(' ')[0]
  const her = pronoun(p.sex).her
  const tier = p.current.tier
  const ratio = f.probability_72h / Math.max(0.005, x.base_rate)
  const reasons = x.contributors.slice(0, 2).map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1))
  return {
    id: p.id,
    headline: tier === 'urgent' ? 'Strain episode likely in the next 72 hours' : tier === 'watch' ? 'Worth a check-in this week' : tier === 'opted_out' ? 'Predictions are switched off' : 'Steady, close to usual',
    tier,
    sentences: [
      `${first}'s twin puts the chance of a strain episode in the next 72 hours at ${fmtPct(f.probability_72h)}${ratio >= 1.5 ? `, about ${Math.round(ratio)} times ${her} usual ${fmtPct(x.base_rate)}` : ''}.`,
      reasons.length ? `The main reasons are ${reasons.join(' and ')}.` : 'No single reason stands out.',
    ],
    next_step: tier === 'urgent' ? 'Call today, check medicines are being taken, and ask for an evening BP reading.' : tier === 'watch' ? 'Send a check-in message and review again tomorrow.' : 'No action needed. Review at the next visit.',
    streams: {
      record: [...p.ehr.conditions.slice(0, 2).map((c) => c.display), `Framingham 10-year risk ${p.static_risk.framingham_10y_pct}%`],
      wearable: x.inputs_used.filter((i) => !i.startsWith('EHR')),
    },
    usual_probability: x.base_rate,
  }
}
