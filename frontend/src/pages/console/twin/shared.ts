import type { AsyncState } from '@/api/hooks'
import type { Alert, AlertsResponse, Escalation, Explain, Forecast, Patient, Physiology, TwinSummary } from '@/api/types'

export type TabKey = 'overview' | 'twin' | 'simulate' | 'records' | 'alerts'

export interface TabBaseProps {
  id: string
  patient: AsyncState<Patient>
}

export interface OverviewProps extends TabBaseProps {
  forecast: AsyncState<Forecast>
  explain: AsyncState<Explain>
  physiology: AsyncState<Physiology>
  onTab: (k: TabKey) => void
}

export interface TwinTabProps extends TabBaseProps {
  forecast: AsyncState<Forecast>
}

export interface SimulateTabProps extends TwinTabProps {
  physiology: AsyncState<Physiology>
}

export interface AlertsTabProps extends TabBaseProps {
  alerts: AsyncState<AlertsResponse>
  escalations: Escalation[]
  refetchEscalations: () => Promise<void>
}

export interface SummaryProps extends TabBaseProps {
  summary: AsyncState<TwinSummary>
  forecast: AsyncState<Forecast>
  explain: AsyncState<Explain>
  alerts: AsyncState<AlertsResponse>
  activeEscalation: Escalation | null
  onEscalated: () => void
}

export function replaceAlert(list: AlertsResponse | null, a: Alert): AlertsResponse | null {
  if (!list) return list
  const exists = list.alerts.some((x) => x.id === a.id)
  return { ...list, alerts: exists ? list.alerts.map((x) => (x.id === a.id ? { ...x, ...a } : x)) : [a, ...list.alerts] }
}

export function openAlertOf(list: AlertsResponse | null): Alert | undefined {
  return (list?.alerts ?? [])
    .filter((a) => a.status === 'open' || a.status === 'acknowledged' || a.status === 'snoozed' || a.status === 'escalated')
    .sort((a, b) => (a.tier === b.tier ? (a.created_at < b.created_at ? 1 : -1) : a.tier === 'urgent' ? -1 : b.tier === 'urgent' ? 1 : a.tier === 'watch' ? -1 : 1))[0]
}

/** "Her usual range", "His usual range", "Their usual range". */
export function usualLabel(p: Patient | null): string {
  if (!p) return 'Usual range'
  return p.sex === 'F' ? 'Her usual range' : p.sex === 'M' ? 'His usual range' : 'Their usual range'
}

export function firstName(p: Patient | null): string {
  return p?.name.split(' ')[0] ?? 'This person'
}
