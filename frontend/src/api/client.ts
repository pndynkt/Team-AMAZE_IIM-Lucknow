// Typed client for every endpoint in docs/API.md (v1 and the v1.1 additions).
// Every page reads data through `api` below. The data source is chosen in one place at the end of
// this file: the live backend (default), or the fixture-backed mock when VITE_MOCK=1. A static
// snapshot source can be added there later without touching any page.
// In dev, vite.config.ts proxies /api to http://127.0.0.1:8000.

import type {
  Alert,
  AlertEscalateResponse,
  AlertMutationResponse,
  AlertOutcome,
  AlertsQuery,
  AlertsResponse,
  AnnotateBody,
  AuditResponse,
  CheckinBody,
  CheckinResponse,
  Consent,
  ConsentUpdate,
  Escalation,
  EscalationCreateBody,
  EscalationRespondBody,
  Explain,
  Forecast,
  Health,
  Intraday,
  Meta,
  MeView,
  ModelCard,
  OkResponse,
  Patient,
  Physiology,
  SimulateBody,
  SimulateResponse,
  StreamSample,
  StreamScenario,
  ThresholdPreview,
  Thresholds,
  ThresholdsDraft,
  Timeline,
  TriageQuery,
  TriageResponse,
  TwinSummary,
} from './types'

export class ApiRequestError extends Error {
  status: number
  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

/** True when an endpoint does not exist yet on this backend (v1.1 routes during the rollout). */
export function isNotAvailable(e: unknown): boolean {
  return e instanceof ApiRequestError && (e.status === 404 || e.status === 405 || e.status === 501)
}

export interface ApiClient {
  meta(): Promise<Meta>
  health(): Promise<Health>

  patients(q?: TriageQuery): Promise<TriageResponse>
  patient(id: string): Promise<Patient>
  timeline(id: string, days: number, reveal?: boolean): Promise<Timeline>
  intraday(id: string, date: string): Promise<Intraday>
  forecast(id: string): Promise<Forecast>
  explain(id: string): Promise<Explain>
  /** v1.1: personal response slopes from the physiology engine. */
  physiology(id: string, reveal?: boolean): Promise<Physiology>
  /** v1.1: the clinician-facing twin summary. */
  summary(id: string): Promise<TwinSummary>
  simulate(id: string, body: SimulateBody): Promise<SimulateResponse>
  annotatePatient(id: string, body: AnnotateBody & { by: string }): Promise<OkResponse>
  consent(id: string): Promise<Consent>
  updateConsent(id: string, body: ConsentUpdate): Promise<Consent>
  exportWellnessUrl(id: string): string
  exportEhrUrl(id: string): string

  alerts(q?: AlertsQuery): Promise<AlertsResponse>
  ackAlert(id: string, body: { by: string; note?: string }): Promise<AlertMutationResponse>
  snoozeAlert(id: string, body: { by: string; hours: number }): Promise<AlertMutationResponse>
  escalateAlert(id: string, body: { by: string; reason: string }): Promise<AlertEscalateResponse>
  resolveAlert(
    id: string,
    body: { by: string; outcome: AlertOutcome; note?: string },
  ): Promise<AlertMutationResponse>

  thresholds(): Promise<Thresholds>
  previewThresholds(draft: ThresholdsDraft): Promise<ThresholdPreview>
  applyThresholds(draft: ThresholdsDraft): Promise<Thresholds>

  createEscalation(body: EscalationCreateBody): Promise<Escalation>
  escalation(id: string): Promise<Escalation>
  escalations(status: 'active' | 'all'): Promise<Escalation[]>
  respondEscalation(id: string, body: EscalationRespondBody): Promise<Escalation>

  audit(q?: { patient_id?: string; limit?: number }): Promise<AuditResponse>

  me(id: string): Promise<MeView>
  checkin(id: string, body: CheckinBody): Promise<CheckinResponse>
  annotateMe(id: string, body: AnnotateBody): Promise<OkResponse>

  model(): Promise<ModelCard>

  injectStream(id: string, scenario: StreamScenario): Promise<OkResponse>
  /** Opens the SSE stream. Returns a function that closes it. */
  openStream(
    id: string,
    onSample: (s: StreamSample) => void,
    onStatus?: (status: 'open' | 'error') => void,
  ): () => void
}

const BASE = '/api'

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
  if (!entries.length) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of entries) sp.set(k, String(v))
  return `?${sp.toString()}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiRequestError(0, 'Could not reach the server. Check that the backend is running on port 8000.')
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiRequestError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  // An unknown route can fall through to the single-page app and come back as HTML with a 200.
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new ApiRequestError(404, 'This part of the twin is not available on the server yet.')
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiRequestError(502, 'The server sent a response that could not be read.')
  }
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

/** Accepts either `{ escalations: [...] }` or a bare array, since API.md leaves the list shape open. */
function normaliseEscalations(raw: unknown): Escalation[] {
  if (Array.isArray(raw)) return raw as Escalation[]
  if (raw && typeof raw === 'object') {
    const obj = raw as { escalations?: Escalation[]; items?: Escalation[] }
    return obj.escalations ?? obj.items ?? []
  }
  return []
}

export const realClient: ApiClient = {
  meta: () => request('/meta'),
  health: () => request('/health'),

  patients: (q = {}) => request(`/patients${qs({ tier: q.tier, sort: q.sort, q: q.q })}`),
  patient: (id) => request(`/patients/${encodeURIComponent(id)}`),
  timeline: (id, days, reveal) =>
    request(`/patients/${encodeURIComponent(id)}/timeline${qs({ days, reveal: reveal ? 1 : undefined })}`),
  intraday: (id, date) => request(`/patients/${encodeURIComponent(id)}/intraday${qs({ date })}`),
  forecast: (id) => request(`/patients/${encodeURIComponent(id)}/forecast`),
  explain: (id) => request(`/patients/${encodeURIComponent(id)}/explain`),
  physiology: (id, reveal) => request(`/patients/${encodeURIComponent(id)}/physiology${qs({ reveal: reveal ? 1 : undefined })}`),
  summary: (id) => request(`/patients/${encodeURIComponent(id)}/summary`),
  simulate: (id, body) => post(`/patients/${encodeURIComponent(id)}/simulate`, body),
  annotatePatient: (id, body) => post(`/patients/${encodeURIComponent(id)}/annotate`, body),
  consent: (id) => request(`/patients/${encodeURIComponent(id)}/consent`),
  updateConsent: (id, body) => post(`/patients/${encodeURIComponent(id)}/consent`, body),
  exportWellnessUrl: (id) => `${BASE}/patients/${encodeURIComponent(id)}/export/wellnessrecord`,
  exportEhrUrl: (id) => `${BASE}/patients/${encodeURIComponent(id)}/export/ehr`,

  alerts: (q = {}) => request(`/alerts${qs({ status: q.status, patient_id: q.patient_id })}`),
  ackAlert: (id, body) => post(`/alerts/${encodeURIComponent(id)}/ack`, body),
  snoozeAlert: (id, body) => post(`/alerts/${encodeURIComponent(id)}/snooze`, body),
  escalateAlert: (id, body) => post(`/alerts/${encodeURIComponent(id)}/escalate`, body),
  resolveAlert: (id, body) => post(`/alerts/${encodeURIComponent(id)}/resolve`, body),

  thresholds: () => request('/thresholds'),
  previewThresholds: (draft) => post('/thresholds/preview', draft),
  applyThresholds: (draft) => post('/thresholds', draft),

  createEscalation: (body) => post('/escalations', body),
  escalation: (id) => request(`/escalations/${encodeURIComponent(id)}`),
  escalations: async (status) => normaliseEscalations(await request(`/escalations${qs({ status })}`)),
  respondEscalation: (id, body) => post(`/escalations/${encodeURIComponent(id)}/respond`, body),

  audit: (q = {}) => request(`/audit${qs({ patient_id: q.patient_id, limit: q.limit ?? 100 })}`),

  me: (id) => request(`/me/${encodeURIComponent(id)}`),
  checkin: (id, body) => post(`/me/${encodeURIComponent(id)}/checkin`, body),
  annotateMe: (id, body) => post(`/me/${encodeURIComponent(id)}/annotate`, body),

  model: () => request('/model'),

  injectStream: (id, scenario) => post(`/stream/${encodeURIComponent(id)}/inject`, { scenario }),
  openStream: (id, onSample, onStatus) => {
    if (typeof EventSource === 'undefined') {
      onStatus?.('error')
      return () => {}
    }
    const es = new EventSource(`${BASE}/stream/${encodeURIComponent(id)}`)
    es.onopen = () => onStatus?.('open')
    es.onerror = () => onStatus?.('error')
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as StreamSample
        if (typeof data.hr === 'number') onSample(data)
      } catch {
        /* ignore malformed frames */
      }
    }
    return () => es.close()
  },
}

export const IS_MOCK = import.meta.env.VITE_MOCK === '1'

// Data source dispatch, in one place. The mock module is only imported when VITE_MOCK=1,
// so production builds do not carry the fixtures.
let client: ApiClient = realClient
if (IS_MOCK) {
  const mod = await import('./mock')
  client = mod.mockClient
}

export const api: ApiClient = client

export type { Alert }
