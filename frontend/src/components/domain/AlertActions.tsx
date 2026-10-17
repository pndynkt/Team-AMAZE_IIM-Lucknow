import { useState } from 'react'
import { Check, CheckCircle2, Clock, X } from 'lucide-react'
import { api } from '@/api/client'
import type { Alert, AlertOutcome, Escalation } from '@/api/types'
import { Glyph } from '@/brand'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useMeta } from '@/lib/meta'
import { cn } from '@/lib/cn'

export interface AlertActionsProps {
  alert: Alert
  onUpdated?: (a: Alert) => void
  onEscalated?: (es: Escalation) => void
  size?: 'sm' | 'md'
  className?: string
  /** Show the resolve options (console alerts page). */
  withResolve?: boolean
}

const OUTCOME_WORD: Record<AlertOutcome, string> = { handled: 'handled', true_event: 'a true event', false_alarm: 'a false alarm' }

/** Acknowledge, snooze 3 h, escalate, resolve. Every action writes an audit entry on the server. */
export function AlertActions({ alert, onUpdated, onEscalated, size = 'sm', className, withResolve = true }: AlertActionsProps) {
  const toast = useToast()
  const { clinician } = useMeta()
  const [busy, setBusy] = useState<string | null>(null)
  const [resolveOpen, setResolveOpen] = useState(false)
  const terminal = alert.status === 'resolved'

  const run = async (key: string, fn: () => Promise<void>, retry?: () => void) => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toast.error(`Could not ${key} this alert`, retry, e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(null)
    }
  }

  const ack = () =>
    run('acknowledge', async () => {
      const res = await api.ackAlert(alert.id, { by: clinician, note: 'Acknowledged from the console' })
      onUpdated?.(res)
      toast.success(`Acknowledged for ${alert.patient_name}`, 'Written to the audit log.')
    }, ack)

  const snooze = () =>
    run('snooze', async () => {
      const res = await api.snoozeAlert(alert.id, { by: clinician, hours: 3 })
      onUpdated?.(res)
      toast.success(`Snoozed for 3 hours`, `${alert.patient_name} comes back to the top of the list after that.`)
    }, snooze)

  const escalate = () =>
    run('escalate', async () => {
      const es = await api.escalateAlert(alert.id, { by: clinician, reason: 'Escalated from the console' })
      onUpdated?.({ ...alert, status: 'escalated', escalation_id: es.id })
      onEscalated?.(es)
      toast.info('Escalation started', 'The first contact is being reached. The banner at the top follows it live.')
    }, escalate)

  const resolve = (outcome: AlertOutcome) =>
    run('resolve', async () => {
      const res = await api.resolveAlert(alert.id, { by: clinician, outcome, note: outcome === 'false_alarm' ? 'Reviewed, no action needed' : undefined })
      onUpdated?.(res)
      setResolveOpen(false)
      toast.success(`Resolved as ${OUTCOME_WORD[outcome]}`)
    })

  if (terminal) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-[13px] text-ink-2', className)}>
        <CheckCircle2 className="h-4 w-4 text-leaf" aria-hidden /> Resolved{alert.outcome ? `, ${OUTCOME_WORD[alert.outcome]}` : ''}
      </span>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} onClick={(e) => e.stopPropagation()}>
      {alert.status === 'open' && (
        <Button size={size} variant="secondary" loading={busy === 'acknowledge'} onClick={ack} icon={<Check />}>
          Acknowledge
        </Button>
      )}
      {(alert.status === 'open' || alert.status === 'acknowledged') && (
        <Button size={size} variant="secondary" loading={busy === 'snooze'} onClick={snooze} icon={<Clock />}>
          Snooze 3 h
        </Button>
      )}
      {alert.status !== 'escalated' && (
        <Button size={size} variant="danger" loading={busy === 'escalate'} onClick={escalate} icon={<Glyph name="ladder" size={size === 'sm' ? 14 : 16} tone="current" />}>
          Escalate
        </Button>
      )}
      {withResolve && !resolveOpen && (
        <Button size={size} variant="quiet" onClick={() => setResolveOpen(true)}>
          Resolve
        </Button>
      )}
      {withResolve && resolveOpen && (
        <span className="inline-flex flex-wrap items-center gap-1 rounded-control bg-ink/[0.045] p-1" role="group" aria-label="Resolve as">
          <Button size="sm" variant="secondary" loading={busy === 'resolve'} onClick={() => resolve('handled')}>
            Handled
          </Button>
          <Button size="sm" variant="secondary" loading={busy === 'resolve'} onClick={() => resolve('true_event')}>
            True event
          </Button>
          <Button size="sm" variant="secondary" loading={busy === 'resolve'} onClick={() => resolve('false_alarm')}>
            False alarm
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setResolveOpen(false)} icon={<X />} aria-label="Cancel" />
        </span>
      )}
    </div>
  )
}
