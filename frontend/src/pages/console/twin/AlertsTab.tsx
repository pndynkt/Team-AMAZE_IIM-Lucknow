import { useState } from 'react'
import { api } from '@/api/client'
import type { Alert, Escalation } from '@/api/types'
import { Panel } from '@/components/ui/Panel'
import { TierChip } from '@/components/ui/TierChip'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { AlertActions } from '@/components/domain/AlertActions'
import { EscalationLadder } from '@/components/domain/EscalationLadder'
import { useMeta } from '@/lib/meta'
import { fmtDateTime } from '@/lib/format'
import { alertKindWord, alertStatusWord } from '@/pages/console/alertWords'
import { replaceAlert, type AlertsTabProps } from './shared'

export default function AlertsTab({ alerts, escalations, refetchEscalations }: AlertsTabProps) {
  const toast = useToast()
  const { clinician } = useMeta()
  const [busy, setBusy] = useState(false)
  const active = escalations.filter((e) => e.state !== 'resolved' && e.state !== 'cancelled')
  const past = escalations.filter((e) => e.state === 'resolved' || e.state === 'cancelled')
  const list = [...(alerts.data?.alerts ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  const respond = async (es: Escalation, action: 'resolved' | 'false_alarm' | 'im_ok' | 'acknowledged') => {
    setBusy(true)
    try {
      await api.respondEscalation(es.id, { by: 'doctor', action, note: `${clinician} from the console` })
      await Promise.all([refetchEscalations(), alerts.refetch()])
      toast.success(action === 'false_alarm' ? 'Closed as a false alarm' : 'Marked resolved', 'Everyone on the ladder is told, and the audit log has the entry.')
    } catch (e) {
      toast.error('Could not update the escalation', () => respond(es, action), e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {active.map((es) => (
        <section key={es.id} className="panel border-sindoor/25 p-6 md:p-7">
          <p className="mb-4 text-[13px] text-ink-2">The check-in ladder, live. Updated every 2 seconds. Open a step to see exactly what each contact receives.</p>
          <EscalationLadder escalation={es} viewer="clinician" busy={busy} onRespond={(a) => respond(es, a)} />
        </section>
      ))}

      <Panel title="Alerts for this person" subtitle={alerts.data ? `${list.length} in total, newest first` : undefined} padded={false}>
        {alerts.loading && !alerts.data ? (
          <div className="px-6 pb-6">
            <SkeletonCard rows={4} className="border-0 p-0 shadow-none" />
          </div>
        ) : alerts.error && !alerts.data ? (
          <ErrorState title="Alerts did not load" body={alerts.error.message} onRetry={alerts.refetch} className="mx-6 mb-6" />
        ) : list.length === 0 ? (
          <EmptyState title="No alerts yet" body="Alerts from the model, the overnight rule, the live stream, SOS and check-ins show up here." className="mx-6 mb-6" />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {list.map((a) => (
              <AlertLine key={a.id} a={a} onUpdated={(u) => alerts.setData((prev) => replaceAlert(prev, u))} onEscalated={() => void refetchEscalations()} />
            ))}
          </ul>
        )}
      </Panel>

      {past.length > 0 && (
        <Panel title="Earlier escalations" subtitle={`${past.length} closed`} tone="quiet">
          <div className="space-y-6 divide-y divide-line">
            {past.map((es) => (
              <EscalationLadder key={es.id} escalation={es} viewer="clinician" compact hideActions className="pt-6 first:pt-0" />
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function AlertLine({ a, onUpdated, onEscalated }: { a: Alert; onUpdated: (a: Alert) => void; onEscalated: () => void }) {
  return (
    <li className="flex flex-wrap items-start gap-4 px-6 py-4 md:px-7">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <TierChip tier={a.tier} />
          <span className="text-[15px] font-semibold text-ink">{a.title}</span>
        </div>
        <p className="mt-1 text-[14px] leading-5 text-ink-2">{a.reason}</p>
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] text-ink-2">
          <span>{alertKindWord(a.kind)}</span>
          <span className="tnum">{fmtDateTime(a.created_at)}</span>
          <span>{alertStatusWord(a)}</span>
          <span>Confidence {a.confidence}</span>
        </p>
      </div>
      <AlertActions alert={a} onUpdated={onUpdated} onEscalated={onEscalated} />
    </li>
  )
}
