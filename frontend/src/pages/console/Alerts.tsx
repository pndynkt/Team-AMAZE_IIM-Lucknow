import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '@/api/client'
import { useApi } from '@/api/hooks'
import type { Alert, AlertBudget, AlertKind, AlertStatus, Tier } from '@/api/types'
import { PageHeader } from '@/components/layout/ConsoleShell'
import { TierChip } from '@/components/ui/TierChip'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/Tabs'
import { Sheet } from '@/components/ui/Sheet'
import { Chip } from '@/components/ui/Chip'
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { AlertActions } from '@/components/domain/AlertActions'
import { StreamTag } from '@/components/domain/StreamTag'
import { fmtDateTime, fmtNum, fmtPct } from '@/lib/format'
import { cn } from '@/lib/cn'
import { replaceAlert } from './twin/shared'
import { ALERT_KINDS, alertKindWord, alertStatusWord } from './alertWords'

type StatusFilter = AlertStatus | 'all'
const STATUSES: { key: StatusFilter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'snoozed', label: 'Snoozed' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
]

export default function AlertsPage() {
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const status = (params.get('status') as StatusFilter | null) ?? 'open'
  const [tier, setTier] = useState<Tier | 'all'>('all')
  const [kind, setKind] = useState<AlertKind | 'all'>('all')
  const [selected, setSelected] = useState<Alert | null>(null)

  const alerts = useApi(() => api.alerts({ status }), [status])
  useEffect(() => {
    if (alerts.error) toast.error('Could not load alerts', alerts.refetch, alerts.error.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.error])

  const list = useMemo(() => {
    let l = [...(alerts.data?.alerts ?? [])]
    if (tier !== 'all') l = l.filter((a) => a.tier === tier)
    if (kind !== 'all') l = l.filter((a) => a.kind === kind)
    const rank = { urgent: 0, watch: 1, low: 2 }
    l.sort((a, b) => (a.status === b.status ? (rank[a.tier] - rank[b.tier] || (a.created_at < b.created_at ? 1 : -1)) : a.status === 'open' ? -1 : b.status === 'open' ? 1 : 0))
    return l
  }, [alerts.data, tier, kind])

  const setStatus = (s: StatusFilter) => {
    const next = new URLSearchParams(params)
    if (s === 'open') next.delete('status')
    else next.set('status', s)
    setParams(next, { replace: true })
  }

  const b = alerts.data?.budget

  return (
    <div>
      <PageHeader title="Alerts" subtitle="Every alert carries its reason, its confidence and the inputs it used. Act on it here, or open the person.">
        {b && <BudgetSentence b={b} />}
      </PageHeader>

      {b ? <BudgetMeter b={b} /> : alerts.loading ? <Skeleton className="mb-6 h-28 rounded-panel" /> : null}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Tabs variant="segmented" aria-label="Status" value={status} onChange={setStatus} items={STATUSES} />
        <label className="sr-only" htmlFor="alert-tier">
          Tier
        </label>
        <select id="alert-tier" value={tier} onChange={(e) => setTier(e.target.value as Tier | 'all')} className="field h-9 rounded-[10px] py-0 pr-8 text-[13.5px]">
          <option value="all">Any tier</option>
          <option value="urgent">Urgent</option>
          <option value="watch">Watch</option>
          <option value="low">Low</option>
        </select>
        <label className="sr-only" htmlFor="alert-kind">
          Source
        </label>
        <select id="alert-kind" value={kind} onChange={(e) => setKind(e.target.value as AlertKind | 'all')} className="field h-9 rounded-[10px] py-0 pr-8 text-[13.5px]">
          <option value="all">Any source</option>
          {ALERT_KINDS.map((k) => (
            <option key={k} value={k}>
              {alertKindWord(k)}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[13px] tnum text-ink-2">{alerts.data ? `${list.length} ${list.length === 1 ? 'alert' : 'alerts'}` : ''}</span>
      </div>

      {alerts.loading && !alerts.data ? (
        <Skeleton className="h-[420px] rounded-panel" />
      ) : alerts.error && !alerts.data ? (
        <ErrorState title="Alerts did not load" body={alerts.error.message} onRetry={alerts.refetch} />
      ) : list.length === 0 ? (
        <EmptyState title={status === 'open' ? 'No open alerts' : 'Nothing matches'} body={status === 'open' ? 'The twin keeps scoring every sync. New alerts appear here first.' : 'Try another status, tier or source.'} />
      ) : (
        <div className="panel overflow-hidden">
          <ul className="divide-y divide-line">
            {list.map((a) => (
              <AlertRow key={a.id} a={a} onOpen={() => setSelected(a)} onUpdated={(u) => alerts.setData((prev) => replaceAlert(prev, u))} />
            ))}
          </ul>
        </div>
      )}

      <Sheet open={!!selected} onClose={() => setSelected(null)} title="Why this alert" description={selected ? `${selected.patient_name}, ${fmtDateTime(selected.created_at)}` : undefined} width={520}>
        {selected && <WhyThisAlert a={selected} />}
      </Sheet>
    </div>
  )
}

function BudgetSentence({ b }: { b: AlertBudget }) {
  const within = b.status === 'within_budget'
  return (
    <p className="mt-2 text-[15px] leading-6 text-ink">
      False alerts are <span className={cn('font-semibold', within ? 'text-leaf' : 'text-sindoor')}>{within ? 'inside the budget' : 'over the budget'}</span>: <span className="tnum font-semibold">{b.observed_rate.toFixed(3)}</span> a patient-day this week, against a target of{' '}
      <span className="tnum">{b.target_false_alerts_per_patient_day.toFixed(3)}</span>.
    </p>
  )
}

function BudgetMeter({ b }: { b: AlertBudget }) {
  const scale = Math.max(b.target_false_alerts_per_patient_day, b.observed_rate, b.observed_validation) * 1.35
  const pos = (v: number) => `${Math.min(100, (v / scale) * 100)}%`
  return (
    <section className="mb-6 rounded-panel border border-line bg-surface/60 px-6 py-5" aria-label="False-alert budget">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-center">
        <div>
          <div className="relative h-3 rounded-full bg-mist-deep" aria-hidden>
            <span className="absolute inset-y-0 left-0 rounded-full bg-peacock" style={{ width: pos(b.observed_rate) }} />
            <span className="absolute -top-1.5 h-6 w-[2px] -translate-x-1/2 rounded-full bg-ink" style={{ left: pos(b.target_false_alerts_per_patient_day) }} />
            <span className="absolute -top-1 h-5 w-[2px] -translate-x-1/2 rounded-full bg-ink-3" style={{ left: pos(b.observed_validation) }} />
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
            <div>
              <dt className="inline-flex items-center gap-1.5 text-ink-2">
                <span className="h-2 w-3 rounded-full bg-peacock" aria-hidden /> This week
              </dt>
              <dd className="tnum font-semibold text-ink">
                {b.observed_rate.toFixed(3)}{' '}
                <span className="font-normal text-ink-2">
                  {typeof b.cohort_false_alerts_last_7d === 'number' ? `${b.cohort_false_alerts_last_7d} false of ${b.cohort_alerts_last_7d} alerts` : `${b.cohort_alerts_last_7d} alerts`}, {fmtNum(b.cohort_patient_days_last_7d)} patient-days
                </span>
              </dd>
            </div>
            <div>
              <dt className="inline-flex items-center gap-1.5 text-ink-2">
                <span className="h-3 w-[2px] rounded-full bg-ink-3" aria-hidden /> In validation
              </dt>
              <dd className="tnum font-semibold text-ink">{b.observed_validation.toFixed(3)}</dd>
            </div>
            <div>
              <dt className="inline-flex items-center gap-1.5 text-ink-2">
                <span className="h-3 w-[2px] rounded-full bg-ink" aria-hidden /> Budget
              </dt>
              <dd className="tnum font-semibold text-ink">{b.target_false_alerts_per_patient_day.toFixed(3)}</dd>
            </div>
          </dl>
        </div>
        <p className="text-[13.5px] leading-5 text-ink-2">
          The budget caps how often the twin may interrupt you with an alert that needs no action. Change it on{' '}
          <Link to="/console/thresholds" className="font-medium text-peacock-deep underline decoration-peacock/30 underline-offset-[3px] hover:decoration-peacock dark:text-peacock">
            Thresholds
          </Link>
          .
        </p>
      </div>
    </section>
  )
}

function AlertRow({ a, onOpen, onUpdated }: { a: Alert; onOpen: () => void; onUpdated: (a: Alert) => void }) {
  return (
    <li className="flex flex-wrap items-start gap-4 px-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <TierChip tier={a.tier} />
          <Link to={`/console/patients/${a.patient_id}`} onClick={(e) => e.stopPropagation()} className="text-[15px] font-semibold text-ink hover:underline">
            {a.patient_name}
          </Link>
          <span className="text-[14.5px] text-ink">{a.title}</span>
          {a.confidence === 'low' && <Chip tone="turmeric">Low confidence, shown as watch</Chip>}
        </div>
        <p className="mt-1 text-[14px] leading-5 text-ink-2">{a.reason}</p>
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] text-ink-2">
          <span>{alertKindWord(a.kind)}</span>
          <span className="tnum">{fmtDateTime(a.created_at)}</span>
          <span>{alertStatusWord(a)}</span>
          <span>{a.owner}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="quiet" onClick={onOpen}>
          Why this alert
        </Button>
        <AlertActions alert={a} onUpdated={onUpdated} />
      </div>
    </li>
  )
}

function WhyThisAlert({ a }: { a: Alert }) {
  const explain = useApi(() => api.explain(a.patient_id), [a.patient_id])
  const model = useApi(() => api.model(), [])
  const x = explain.data
  const m = model.data
  return (
    <div className="space-y-6 text-[14px]">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <TierChip tier={a.tier} />
          <Chip>{alertKindWord(a.kind)}</Chip>
          <Chip>Confidence {a.confidence}</Chip>
        </div>
        <p className="mt-3 text-[16px] font-semibold">{a.title}</p>
        <p className="mt-1 text-ink-2">{a.reason}</p>
      </section>

      <section>
        <h3 className="mb-2 text-[14px] font-semibold">Inputs it used</h3>
        {explain.error ? (
          <ErrorState title="The explanation did not load" body={explain.error.message} onRetry={explain.refetch} />
        ) : !x ? (
          <SkeletonText lines={4} />
        ) : (
          <>
            <ul className="flex flex-wrap gap-1.5">
              {x.inputs_used.map((i) => (
                <li key={i}>
                  <StreamTag stream={i.startsWith('EHR') ? 'record' : 'wearable'}>{i.replace(/^EHR: /, 'Record: ')}</StreamTag>
                </li>
              ))}
            </ul>
            <p className={cn('mt-2.5 text-[13px]', x.stale_inputs.length ? 'font-medium text-turmeric' : 'text-ink-2')}>{x.stale_inputs.length ? `Out of date when scored: ${x.stale_inputs.join(', ')}` : 'All inputs were up to date when it was scored.'}</p>
            <h3 className="mb-1.5 mt-5 text-[14px] font-semibold">Main reasons</h3>
            <ul className="list-disc space-y-1 pl-5 text-ink-2">
              {x.contributors.slice(0, 3).map((c) => (
                <li key={c.feature}>{c.label}</li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] tnum text-ink-2">
              Chance {fmtPct(x.probability_72h)} against a usual {fmtPct(x.base_rate)}. Model {x.model_version}.
            </p>
          </>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[14px] font-semibold">How well the model does</h3>
        {!m ? (
          <SkeletonText lines={3} />
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 text-[13.5px] tnum">
            <Kv k="Catches" v={fmtPct(m.metrics.fused.sensitivity ?? 0)} />
            <Kv k="Median warning" v={`${m.metrics.fused.median_lead_hours ?? '--'} h ahead`} />
            <Kv k="False alerts" v={`${m.metrics.fused.false_alerts_per_patient_day?.toFixed(3) ?? '--'} a day`} />
            <Kv k="AUROC" v={m.metrics.fused.auroc?.toFixed(2) ?? '--'} />
          </dl>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[14px] font-semibold">What it cannot do</h3>
        {!m ? (
          <SkeletonText lines={3} />
        ) : (
          <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] text-ink-2">
            {m.limitations.slice(0, 4).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </section>

      <Link to={`/console/patients/${a.patient_id}`} className="inline-flex h-10 items-center rounded-control bg-peacock-deep px-4 text-[14px] font-medium text-on-peacock hover:bg-peacock-deep/90">
        Open {a.patient_name.split(' ')[0]}'s twin
      </Link>
    </div>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line py-2">
      <dt className="text-ink-2">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  )
}
