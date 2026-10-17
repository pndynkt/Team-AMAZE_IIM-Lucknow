import type { Alert, AlertKind } from '@/api/types'
import { fmtDateTime } from '@/lib/format'

const KIND: Record<AlertKind, string> = {
  model: 'From the twin',
  rule: 'Overnight heart-rate rule',
  sos: 'SOS from the person',
  fall: 'Fall reported by the phone',
  caregiver: 'From a check-in',
  acute: 'Live heart rate',
}

export function alertKindWord(k: AlertKind): string {
  return KIND[k] ?? k
}

export function alertStatusWord(a: Alert): string {
  switch (a.status) {
    case 'open':
      return 'Open'
    case 'acknowledged':
      return a.acknowledged_by ? `Acknowledged by ${a.acknowledged_by}` : 'Acknowledged'
    case 'snoozed':
      return a.snoozed_until ? `Snoozed until ${fmtDateTime(a.snoozed_until)}` : 'Snoozed'
    case 'escalated':
      return 'Escalated'
    case 'resolved':
      return a.outcome === 'false_alarm' ? 'Resolved, false alarm' : a.outcome === 'true_event' ? 'Resolved, true event' : 'Resolved'
  }
}

export const ALERT_KINDS: AlertKind[] = ['model', 'rule', 'acute', 'sos', 'fall', 'caregiver']
