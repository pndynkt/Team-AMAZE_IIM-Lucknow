import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, Minus } from 'lucide-react'
import { api } from '@/api/client'
import { useApi, usePoll } from '@/api/hooks'
import type { Freshness as FreshnessT, Patient } from '@/api/types'
import { Glyph } from '@/brand'
import { Tabs } from '@/components/ui/Tabs'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { DeviceLabel, Freshness } from '@/components/domain/Chips'
import { fmtDateTime, sexWord } from '@/lib/format'
import { cn } from '@/lib/cn'
import OverviewTab from './twin/OverviewTab'
import TwinTab from './twin/TwinTab'
import SimulateTab from './twin/SimulateTab'
import RecordsTab from './twin/RecordsTab'
import AlertsTab from './twin/AlertsTab'
import { TwinSummaryPanel } from './twin/Summary'
import type { TabKey } from './twin/shared'

const TABS: TabKey[] = ['overview', 'twin', 'simulate', 'records', 'alerts']

export default function PatientTwin() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const tabParam = params.get('tab') as TabKey | null
  const tab: TabKey = tabParam && TABS.includes(tabParam) ? tabParam : 'overview'
  const setTab = (k: TabKey) => {
    const next = new URLSearchParams(params)
    if (k === 'overview') next.delete('tab')
    else next.set('tab', k)
    setParams(next, { replace: true })
  }

  const patient = useApi(() => api.patient(id), [id])
  const forecast = useApi(() => api.forecast(id), [id])
  const explain = useApi(() => api.explain(id), [id])
  const summary = useApi(() => api.summary(id), [id])
  const physiology = useApi(() => api.physiology(id), [id])
  const alerts = useApi(() => api.alerts({ status: 'all', patient_id: id }), [id])
  // Live escalation for this person: poll every 2 s.
  const escalations = usePoll(() => api.escalations('all'), 2000, true, [id])
  const activeEscalation = useMemo(() => (escalations.data ?? []).find((e) => e.patient_id === id && e.state !== 'resolved' && e.state !== 'cancelled') ?? null, [escalations.data, id])
  const patientEscalations = useMemo(() => (escalations.data ?? []).filter((e) => e.patient_id === id), [escalations.data, id])

  const p = patient.data
  // Older backends carry freshness only on the triage row.
  const triage = useApi(() => api.patients({ q: id }), [id], { enabled: !!p && !p.freshness })
  const freshness = p?.freshness ?? triage.data?.patients.find((row) => row.id === id)?.freshness ?? null

  useEffect(() => {
    if (p) document.title = `${p.name}, Pratibimb`
  }, [p])
  useEffect(() => {
    if (patient.error) toast.error('Could not load this person', patient.refetch, patient.error.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.error])

  const openCount = (alerts.data?.alerts ?? []).filter((a) => a.status === 'open').length

  return (
    <div>
      <nav className="mb-5" aria-label="Breadcrumb">
        <Link to="/console" className="inline-flex items-center gap-1 rounded-[8px] text-[13.5px] font-medium text-ink-2 hover:text-ink">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Today
        </Link>
      </nav>

      {patient.error && !p ? (
        <ErrorState title="This person did not load" body={patient.error.message} onRetry={patient.refetch} />
      ) : (
        <>
          <PatientHeader p={p} freshness={freshness} />

          <div className="mt-6">
            <TwinSummaryPanel
              id={id}
              patient={patient}
              summary={summary}
              forecast={forecast}
              explain={explain}
              alerts={alerts}
              activeEscalation={activeEscalation}
              onEscalated={() => {
                void escalations.refetch()
                setTab('alerts')
              }}
            />
          </div>

          <Tabs
            className="mb-6 mt-8"
            aria-label="Twin sections"
            value={tab}
            onChange={setTab}
            items={[
              { key: 'overview', label: 'Overview' },
              { key: 'twin', label: 'Twin' },
              { key: 'simulate', label: 'Simulate' },
              { key: 'records', label: 'Records' },
              {
                key: 'alerts',
                label: 'Alerts',
                badge: activeEscalation ? (
                  <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-sindoor">
                    <span className="h-1.5 w-1.5 rounded-full bg-sindoor" aria-hidden /> Live
                  </span>
                ) : openCount > 0 ? (
                  <span className="tnum text-[12.5px] font-medium text-ink-2">{openCount} open</span>
                ) : undefined,
              },
            ]}
          />

          {tab === 'overview' && <OverviewTab id={id} patient={patient} forecast={forecast} explain={explain} physiology={physiology} onTab={setTab} />}
          {tab === 'twin' && <TwinTab id={id} patient={patient} forecast={forecast} />}
          {tab === 'simulate' && <SimulateTab id={id} patient={patient} forecast={forecast} physiology={physiology} />}
          {tab === 'records' && <RecordsTab id={id} patient={patient} freshness={freshness} />}
          {tab === 'alerts' && <AlertsTab id={id} patient={patient} alerts={alerts} escalations={patientEscalations} refetchEscalations={escalations.refetch} />}
        </>
      )}
    </div>
  )
}

const CONSENT: { key: keyof Patient['consent']; label: string }[] = [
  { key: 'ehr', label: 'Health record' },
  { key: 'wearable', label: 'Wearable' },
  { key: 'ai_predictions', label: 'Predictions' },
  { key: 'emergency_contacts', label: 'Contacts' },
]

function PatientHeader({ p, freshness }: { p: Patient | null; freshness: FreshnessT | null }) {
  if (!p) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-6 w-[480px] max-w-full" />
      </div>
    )
  }
  return (
    <header>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[32px] font-650 leading-tight tracking-[-0.03em] text-ink">{p.name}</h1>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-ink-2">
            <span className="tnum">{p.age}</span>
            <span>{sexWord(p.sex)}</span>
            <span>
              {p.city}, {p.state}
            </span>
            <span className="tnum text-ink-3">ABHA {p.abha_masked}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <DeviceLabel device={p.device} />
          {freshness && <Freshness f={freshness} />}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <ul className="flex flex-wrap gap-1.5" aria-label="Conditions from the health record">
          {p.ehr.conditions.map((c) => (
            <li key={c.code} className="rounded-full bg-sandalwood-soft px-2.5 py-1 text-[13px] text-ink" title={`${c.system} ${c.code}, since ${c.onset}`}>
              {c.display}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2" title={`Consent updated ${fmtDateTime(p.consent.updated_at)}`}>
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <Glyph name="consent" size={15} tone="current" className="text-leaf" /> Consent
          </span>
          {CONSENT.map((c) => (
            <span key={c.key} className={cn('inline-flex items-center gap-1', !p.consent[c.key] && 'text-ink-3 line-through')}>
              {p.consent[c.key] ? <Check className="h-3.5 w-3.5 text-leaf" strokeWidth={2.4} aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}
              {c.label}
              <span className="sr-only">{p.consent[c.key] ? 'given' : 'not given'}</span>
            </span>
          ))}
        </div>
      </div>
    </header>
  )
}
