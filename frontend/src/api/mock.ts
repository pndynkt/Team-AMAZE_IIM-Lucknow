// Fixture-backed mock client used when VITE_MOCK=1.
// Mutations update in-memory state so Ack, Snooze, Escalate, Resolve, SOS, check-in and consent
// flows work end to end without a backend. The escalation ladder advances on a demo clock
// (meta.demo_speed), like the real server. The v1.1 endpoints (physiology, summary, personal
// simulate effects, what helps, model physiology) are served from fixtures for Meera (P-0007)
// and derived deterministically for everyone else.

import type { ApiClient } from './client'
import type {
  Alert,
  AlertBudget,
  AlertKind,
  AlertOutcome,
  AlertStatus,
  Annotation,
  AuditEntry,
  Consent,
  Escalation,
  EscalationStep,
  Explain,
  Forecast,
  Intraday,
  Meta,
  MeView,
  ModelCard,
  LeverApplied,
  Patient,
  Physiology,
  PhysiologyResponse,
  QuantilePoint,
  SimulateBody,
  SimulateResponse,
  StreamSample,
  StreamScenario,
  ThresholdPreview,
  Thresholds,
  Tier,
  Timeline,
  TimelineRow,
  TriagePatient,
  TriageResponse,
  TwinSummary,
  WhatHelps,
} from './types'

import metaFixture from './fixtures/meta.json'
import patientsFixture from './fixtures/patients.json'
import patientFixture from './fixtures/patient-P-0007.json'
import timeline30Fixture from './fixtures/timeline-P-0007.json'
import timeline120Fixture from './fixtures/timeline-P-0007-120.json'
import intradayFixture from './fixtures/intraday-P-0007.json'
import forecastFixture from './fixtures/forecast-P-0007.json'
import explainFixture from './fixtures/explain-P-0007.json'
import alertsFixture from './fixtures/alerts.json'
import thresholdsFixture from './fixtures/thresholds.json'
import modelFixture from './fixtures/model.json'
import auditFixture from './fixtures/audit.json'
import meFixture from './fixtures/me-P-0007.json'
import escalationFx from './fixtures/escalation.json'
import physiologyFixture from './fixtures/physiology-P-0007.json'
import summaryFixture from './fixtures/summary-P-0007.json'
import { SNAP, loadDetail } from './snapshotSource'

// The hosted demo carries a snapshot of the real API (VITE_SNAPSHOT=1): real model output for the
// cohort list, alerts, audit, model card and the highest-risk people. Every other mock build, and every
// patient outside the snapshot, falls back to the fixtures and the derived views below.
const S = SNAP
const S0 = S?.detail['P-0007']
const metaFx = (S?.meta ?? metaFixture) as typeof metaFixture
const patientsFx = (S?.patients ?? patientsFixture) as typeof patientsFixture
const patientFx = (S0?.patient ?? patientFixture) as typeof patientFixture
const timeline30Fx = (S0?.timeline120 ?? timeline30Fixture) as typeof timeline30Fixture
const timeline120Fx = (S0?.timeline120 ?? timeline120Fixture) as typeof timeline120Fixture
const intradayFx = (S0?.intraday ?? intradayFixture) as typeof intradayFixture
const forecastFx = (S0?.forecast ?? forecastFixture) as typeof forecastFixture
const explainFx = (S0?.explain ?? explainFixture) as typeof explainFixture
const alertsFx = (S?.alerts ?? alertsFixture) as typeof alertsFixture
const thresholdsFx = (S?.thresholds ?? thresholdsFixture) as typeof thresholdsFixture
const modelFx = (S?.model ?? modelFixture) as typeof modelFixture
const auditFx = (S?.audit ?? auditFixture) as typeof auditFixture
const meFx = (S0?.me ?? meFixture) as typeof meFixture
const physiologyFx = (S0?.physiology ?? physiologyFixture) as typeof physiologyFixture
const summaryFx = (S0?.summary ?? summaryFixture) as typeof summaryFixture
/** Snapshot detail for a patient other than the demo patient (who is served through the fixture names). */
const snapDetail = (id: string) => (id !== 'P-0007' ? S?.detail[id] : undefined)

// ----------------------------------------------------------------- helpers

const AS_OF = metaFx.as_of
const DEMO_SPEED = metaFx.demo_speed

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
/** Deep-copies a JSON fixture and asserts the contract type. */
const fx = <T>(x: unknown): T => JSON.parse(JSON.stringify(x)) as T
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const latency = () => sleep(140 + Math.random() * 220)
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Wall-clock time of day, stamped on the cohort's "today" so the demo stays reproducible. */
function nowIso(offsetMs = 0): string {
  const d = new Date(Date.now() + offsetMs)
  const ist = new Date(d.getTime() + 5.5 * 3600000)
  const hh = String(ist.getUTCHours()).padStart(2, '0')
  const mm = String(ist.getUTCMinutes()).padStart(2, '0')
  const ss = String(ist.getUTCSeconds()).padStart(2, '0')
  return `${AS_OF}T${hh}:${mm}:${ss}+05:30`
}

const tierOf = (score: number): Tier => (score >= 60 ? 'urgent' : score >= 30 ? 'watch' : 'low')

// ----------------------------------------------------------------- state

interface MockState {
  alerts: Alert[]
  audit: AuditEntry[]
  thresholds: Thresholds
  escalations: Escalation[]
  consent: Record<string, Consent>
  annotations: Record<string, Annotation[]>
  checkinDone: Record<string, boolean>
  streamScenario: Record<string, StreamScenario>
  nextAlert: number
  nextEscalation: number
  nextAudit: number
}

// One live escalation is seeded so the console banner and ladder have something to show on load.
// It belongs to P-0019 (the acute alert AL-0230), so Meera's patient view starts clean and the SOS
// demo creates its own. The escalation.json fixture documents the contract shape for P-0007.
const seededEscalation = fx<Escalation>(escalationFx)

function defaultState(): MockState {
  return {
    alerts: fx<Alert[]>(alertsFx.alerts),
    audit: fx<AuditEntry[]>(auditFx.entries),
    thresholds: fx<Thresholds>(thresholdsFx),
    escalations: [],
    consent: { 'P-0007': fx<Consent>(patientFx.consent) },
    annotations: { 'P-0007': fx<Annotation[]>(timeline120Fx.annotations) },
    checkinDone: {},
    streamScenario: {},
    nextAlert: 240,
    nextEscalation: 13,
    nextAudit: 2000,
  }
}

let state: MockState = defaultState()

// ----------------------------------------------------------------- persistence (shared across tabs)
// The mock keeps its state in localStorage so a page reload, or the patient view and the console
// open in two tabs, see the same alerts, escalations and audit log. `sync()` runs before every call
// and pulls newer state written by another tab; `commit()` runs after a mutation.

const STORAGE_KEY = S ? 'pratibimb-live-state-v1' : 'pratibimb-mock-state-v1'
const REV_KEY = `${STORAGE_KEY}:rev`
type Persisted = Omit<MockState, 'streamScenario'>
let rev = 0
let dirty = false

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

function sync() {
  const st = storage()
  if (!st) return
  let r: string | null = null
  let raw: string | null = null
  try {
    r = st.getItem(REV_KEY)
    raw = st.getItem(STORAGE_KEY)
  } catch {
    return
  }
  if (r === null) return
  const n = Number(r)
  if (n === rev) return
  if (!raw) return
  try {
    const p = JSON.parse(raw) as Persisted
    state = { ...state, ...p, streamScenario: state.streamScenario }
    rev = n
  } catch {
    /* corrupt entry: keep in-memory state */
  }
}

function commit() {
  dirty = false
  const st = storage()
  if (!st) return
  const { streamScenario: _s, ...persisted } = state
  rev = Date.now()
  try {
    st.setItem(STORAGE_KEY, JSON.stringify(persisted))
    st.setItem(REV_KEY, String(rev))
  } catch {
    /* quota or private mode: state stays in memory */
  }
}

/** Clears the persisted demo state and reseeds. Used by the Settings page. */
export function resetMockState() {
  const st = storage()
  try {
    st?.removeItem(STORAGE_KEY)
    st?.removeItem(REV_KEY)
  } catch {
    /* storage blocked: only the in-memory state is reset */
  }
  state = defaultState()
  rev = 0
  if (!S) seedLiveEscalation()
  commit()
}

function addAudit(e: Omit<AuditEntry, 'id' | 'at'>): AuditEntry {
  dirty = true
  const entry: AuditEntry = { id: state.nextAudit++, at: nowIso(), ...e }
  state.audit.unshift(entry)
  return entry
}

// ----------------------------------------------------------------- escalation state machine

const STEP_SECONDS: Record<string, number> = { user_prompt: 60, contact_1: 120, contact_2: 120 }
const ORDER: Escalation['state'][] = ['user_prompt', 'contact_1', 'contact_2', 'doctor']

function advance(es: Escalation): Escalation {
  if (es.state === 'resolved' || es.state === 'cancelled') return es
  const acknowledged = es.steps.some((s) => s.status === 'acknowledged')
  if (acknowledged) return es
  // elapsed demo seconds since the current step began
  const current = es.steps.find((s) => s.state === es.state)
  if (!current) return es
  const startedMs = new Date(current.at).getTime()
  // Step times are stamped on the cohort's day (nowIso), so measure elapsed time on the same clock.
  const elapsedDemo = ((new Date(nowIso()).getTime() - startedMs) / 1000) * DEMO_SPEED
  const limit = STEP_SECONDS[es.state]
  if (limit === undefined || elapsedDemo < limit) return es
  const idx = ORDER.indexOf(es.state)
  const next = ORDER[idx + 1]
  if (!next) return es
  current.status = es.state === 'user_prompt' ? 'no_response' : 'sent'
  const nextStep = es.steps.find((s) => s.state === next)
  if (nextStep) {
    nextStep.at = nowIso()
    nextStep.status = 'sent'
  }
  es.state = next
  addAudit({
    actor: 'system',
    actor_type: 'system',
    patient_id: es.patient_id,
    action: `escalation.${next}`,
    object: es.id,
    detail: nextStep?.detail ?? next,
    consent_basis: 'emergency_contacts',
    channel: next === 'doctor' ? 'push' : 'sms',
  })
  return advance(es)
}

function tickEscalations() {
  for (const es of state.escalations) advance(es)
}

function buildSteps(patient: Patient, startedAt: string): EscalationStep[] {
  const c1 = patient.emergency_contacts[0]
  const c2 = patient.emergency_contacts[1]
  const first = patient.name.split(' ')[0]
  const pronoun = patient.sex === 'F' ? 'her' : 'him'
  return [
    {
      n: 1,
      state: 'user_prompt',
      at: startedAt,
      detail: "Full-screen alert, sound + vibration, 60 s to tap I'm OK",
      status: 'no_response',
    },
    {
      n: 2,
      state: 'contact_1',
      at: startedAt,
      detail: c1
        ? `${c1.name}: push + SMS (-S template) + WhatsApp utility + voice call from 1600-series number`
        : 'No consented contact on file, skipping to doctor',
      status: 'sent',
      messages: c1
        ? [
            {
              channel: 'sms',
              to: c1.phone_masked,
              template_id: 'PRATIBIMB-S-001',
              header: 'PRTBMB-S',
              body: `Pratibimb: ${patient.name} has not responded to a health check-in. Last location: https://maps.app/x/7h2k, Call ${pronoun} or tap to call 112. Reply STOP to opt out.`,
              mock: true,
            },
            { channel: 'whatsapp', template: 'emergency_checkin_v1', to: c1.phone_masked, mock: true },
            {
              channel: 'voice',
              from: '1600-XXX-XXXX',
              script: `This is Pratibimb. ${first} has not responded to a health check-in. Press 1 if you can reach ${pronoun}. Press 2 to call 112 on ${pronoun === 'her' ? 'her' : 'his'} behalf.`,
              mock: true,
            },
          ]
        : [],
    },
    {
      n: 3,
      state: 'contact_2',
      at: startedAt,
      detail: c2 ? `${c2.name}: SMS (-S template) + voice call` : 'No second contact on file',
      status: 'pending',
      messages: c2
        ? [
            {
              channel: 'sms',
              to: c2.phone_masked,
              template_id: 'PRATIBIMB-S-001',
              header: 'PRTBMB-S',
              body: `Pratibimb: ${patient.name} has not responded to a health check-in. Call ${pronoun} or tap to call 112. Reply STOP to opt out.`,
              mock: true,
            },
            {
              channel: 'voice',
              from: '1600-XXX-XXXX',
              script: `This is Pratibimb. ${first} has not responded to a health check-in. Press 1 if you can reach ${pronoun}.`,
              mock: true,
            },
          ]
        : [],
    },
    {
      n: 4,
      state: 'doctor',
      at: startedAt,
      detail: `${patient.clinician.name} alerted, ${patient.clinician.sla_minutes}-minute SLA`,
      status: 'pending',
    },
  ]
}

// ----------------------------------------------------------------- seed the live escalation (after helpers exist)

function seedLiveEscalation() {
  const p = derivePatient('P-0019')
  const startedAt = nowIso(-8000)
  const es: Escalation = {
    ...seededEscalation,
    id: 'ES-0011',
    patient_id: p.id,
    patient_name: p.name,
    trigger: 'acute',
    started_at: startedAt,
    countdown_ends_at: startedAt,
    state: 'contact_1',
    steps: buildSteps(p, startedAt),
    actions: { call_112_url: 'tel:112', uhi_ambulance_url: 'https://uhi.example/ambulance?ref=ES-0011', mock: true },
    location: { lat: 26.912, lng: 75.787, accuracy_m: 40 },
  }
  es.steps[0].detail = 'Live HR above 140 bpm for 10 minutes; full-screen check-in, 60 s to tap I\'m OK'
  state.escalations.push(es)
}

// ----------------------------------------------------------------- derived patients (ids other than P-0007)

function triageRow(id: string): TriagePatient | undefined {
  return (patientsFx as unknown as TriageResponse).patients.find((p) => p.id === id)
}

/** P-0240 is the new enrolment used to show the calibrating state. */
const CALIBRATING_ID = 'P-0240'

function derivePatient(id: string): Patient {
  const sd = snapDetail(id)
  if (sd) {
    const p = fx<Patient>(sd.patient)
    p.consent = state.consent[id] ?? p.consent
    p.freshness = triageRow(id)?.freshness ?? p.freshness
    return applyConsent(p)
  }
  if (id === 'P-0007') {
    const p = fx<Patient>(patientFx)
    p.consent = state.consent[id] ?? p.consent
    p.freshness = triageRow(id)?.freshness
    return applyConsent(p)
  }
  const row = triageRow(id)
  if (!row) throw new MockError(404, `Patient ${id} not found`)
  const r = rng(hashStr(id))
  const base = fx<Patient>(patientFx)
  const score = row.risk_score ?? 0
  const rhr0 = firstNum(row.sparklines.rhr, 62)
  const sbp0 = firstNum(row.sparklines.sbp, 136)
  const hrv0 = firstNum(row.sparklines.hrv, 40)
  const p: Patient = {
    ...base,
    id,
    name: row.name,
    age: row.age,
    sex: row.sex,
    city: row.city,
    state: cityState(row.city),
    abha_masked: `91-XXXX-XXXX-${String(1000 + Math.floor(r() * 9000))}`,
    consent: state.consent[id] ?? { ...base.consent },
    ehr: {
      ...base.ehr,
      conditions: row.conditions.map((c, i) => ({ code: String(10000000 + Math.floor(r() * 89999999)), system: 'SNOMED', display: c, onset: `${2014 + i * 2 + Math.floor(r() * 3)}-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 9)}` })),
      medications: base.ehr.medications.slice(0, row.conditions.includes('Type 2 diabetes') ? 3 : 2).map((m) => ({ ...m, adherence_30d_pct: Math.round(60 + r() * 38) })),
      labs: base.ehr.labs.map((l) => ({ ...l, value: round(l.value * (0.85 + r() * 0.3), l.unit === '%' ? 1 : 0), flag: r() < 0.3 ? 'high' : 'normal' })),
      vitals_clinic: { sbp: Math.round(sbp0 + 6 + r() * 8), dbp: Math.round(80 + r() * 12), bmi: round(23 + r() * 8, 1), date: '2026-08-20' },
      genetics: { polygenic_risk_tier: score >= 60 ? 'high' : r() < 0.5 ? 'intermediate' : 'low', note: 'Simulated CAD polygenic risk tier (synthetic)' },
      family_history: r() < 0.5 ? ['Father: myocardial infarction at 64'] : [],
      diabetes: row.conditions.includes('Type 2 diabetes'),
      ckd: row.conditions.some((c) => c.startsWith('CKD')),
      smoker: r() < 0.18,
      prior_mi: false,
    },
    static_risk: {
      framingham_10y_pct: round(6 + r() * 18, 1),
      label: score >= 60 ? 'high' : score >= 30 ? 'intermediate' : 'low',
      south_asian_note: base.static_risk.south_asian_note,
    },
    device: { ...row.device, sync_interval: 'hourly' },
    baselines: {
      rhr_28d_median: round(rhr0, 1),
      lnrmssd_60d_mean: round(Math.log(hrv0), 2),
      lnrmssd_swc: 0.08,
      sbp_28d_mean: round(sbp0 + 1.2, 1),
      nights_available: id === CALIBRATING_ID ? 5 : Math.round(40 + r() * 80),
    },
    current: {
      risk_score: row.risk_score,
      tier: row.tier,
      ns_state: row.ns_state,
      probability_72h: round(score / 100, 2),
      probability_band: [round(Math.max(0.01, score / 100 - 0.12), 2), round(Math.min(0.99, score / 100 + 0.1), 2)],
      as_of: AS_OF,
    },
    emergency_contacts: [
      { id: 'C1', name: `${row.sex === 'F' ? 'Ravi' : 'Sunita'} ${row.name.split(' ').slice(-1)[0]}`, relation: row.sex === 'F' ? 'Son' : 'Daughter', phone_masked: '+91 98XXX XX204', channels: ['sms', 'whatsapp', 'voice'], consented_at: '2026-09-01T10:00:00+05:30' },
      { id: 'C2', name: `${row.sex === 'F' ? 'Anita' : 'Mohan'} ${row.name.split(' ').slice(-1)[0]}`, relation: row.sex === 'F' ? 'Sister' : 'Brother', phone_masked: '+91 97XXX XX318', channels: ['sms', 'voice'], consented_at: '2026-09-01T10:05:00+05:30' },
    ],
    clinician: base.clinician,
    freshness: row.freshness,
  }
  return applyConsent(p)
}

/** First non-null value in a sparkline, for deriving baselines. */
function firstNum(xs: (number | null)[], fallback: number): number {
  for (const x of xs) if (typeof x === 'number') return x
  return fallback
}
function lastNum(xs: (number | null)[], fallback: number): number {
  for (let i = xs.length - 1; i >= 0; i--) {
    const x = xs[i]
    if (typeof x === 'number') return x
  }
  return fallback
}
function sparkAt(xs: (number | null)[], i: number, fallback: number): number {
  const x = xs[i]
  return typeof x === 'number' ? x : fallback
}

function cityState(city: string): string {
  const map: Record<string, string> = {
    Bengaluru: 'Karnataka', Mysuru: 'Karnataka', Mumbai: 'Maharashtra', Pune: 'Maharashtra', Nagpur: 'Maharashtra', Delhi: 'Delhi', Noida: 'Uttar Pradesh', Lucknow: 'Uttar Pradesh', Chennai: 'Tamil Nadu', Coimbatore: 'Tamil Nadu', Hyderabad: 'Telangana', Kolkata: 'West Bengal', Jaipur: 'Rajasthan', Kochi: 'Kerala', Ahmedabad: 'Gujarat', Surat: 'Gujarat', Vadodara: 'Gujarat', Indore: 'Madhya Pradesh', Bhopal: 'Madhya Pradesh', Chandigarh: 'Chandigarh', Patna: 'Bihar', Guwahati: 'Assam',
  }
  return map[city] ?? 'India'
}

function applyConsent(p: Patient): Patient {
  if (!p.consent.ai_predictions) {
    p.current = { ...p.current, risk_score: null, tier: 'opted_out' }
  }
  return p
}

function deriveTimeline(id: string, days: number): Timeline {
  const sd = snapDetail(id)
  if (id === 'P-0007' || sd) {
    const src = sd ? sd.timeline120 : days <= 30 ? timeline30Fx : timeline120Fx
    const t = fx<Timeline>(src)
    const from = addDays(AS_OF, -(days - 1))
    t.days = days
    t.rows = t.rows.filter((row) => row.date >= from)
    t.annotations = (state.annotations[id] ?? t.annotations).filter((a) => a.date >= from)
    return t
  }
  const row = triageRow(id)
  if (!row) throw new MockError(404, `Patient ${id} not found`)
  const r = rng(hashStr(id + ':tl'))
  const rhrBase = firstNum(row.sparklines.rhr, 62)
  const hrvBase = firstNum(row.sparklines.hrv, 40)
  const sbpBase = firstNum(row.sparklines.sbp, 136)
  const start = addDays(AS_OF, -(days - 1))
  const rows: TimelineRow[] = []
  const score = row.risk_score ?? 10
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i)
    const k = i - (days - 7)
    const missing = r() < 0.03
    if (missing) {
      rows.push({ date, rhr: null, lnrmssd: null, rmssd: null, sleep_min: null, sleep_eff: null, steps: null, resp_rate: null, spo2: null, sbp_home: null, dbp_home: null, ns_state: 'green', risk_score: null, tier: 'low', missing: true, events: [] })
      continue
    }
    const rhr = k >= 0 ? sparkAt(row.sparklines.rhr, k, rhrBase) + (r() - 0.5) * 0.6 : rhrBase + (r() - 0.5) * 2.6
    const rmssd = k >= 0 ? sparkAt(row.sparklines.hrv, k, hrvBase) + (r() - 0.5) * 0.8 : hrvBase + (r() - 0.5) * 5
    const sbp = k >= 0 ? sparkAt(row.sparklines.sbp, k, sbpBase) : Math.round(sbpBase + (r() - 0.5) * 6)
    const sc = k >= 0 ? Math.round(score - (6 - k) * (row.risk_delta_7d / 7)) : Math.round(clamp(score - row.risk_delta_7d + (r() - 0.5) * 6, 2, 95))
    const delta = rhr - rhrBase
    const ns = delta >= 4 && k >= 1 ? 'red' : delta >= 3 ? 'yellow' : 'green'
    rows.push({
      date,
      rhr: round(rhr, 1),
      lnrmssd: round(Math.log(Math.max(8, rmssd)), 2),
      rmssd: round(rmssd, 1),
      sleep_min: Math.round(400 + (r() - 0.5) * 60 - (k >= 0 ? k * 6 * (row.tier === 'low' ? 0 : 1) : 0)),
      sleep_eff: round(0.86 + (r() - 0.5) * 0.08, 2),
      steps: Math.round(6000 + (r() - 0.5) * 2000 - (k >= 0 ? k * 200 * (row.tier === 'low' ? 0 : 1) : 0)),
      resp_rate: round(14 + (r() - 0.5) * 1.2, 1),
      spo2: round(96.8 + (r() - 0.5) * 1, 1),
      sbp_home: k >= 0 || r() < 0.65 ? sbp : null,
      dbp_home: k >= 0 || r() < 0.65 ? Math.round(sbp * 0.6 + 2) : null,
      ns_state: ns,
      risk_score: clamp(sc, 1, 99),
      tier: tierOf(clamp(sc, 1, 99)),
      missing: false,
      events: [],
    })
  }
  return {
    id,
    days,
    rows,
    baseline_band: { rhr: [round(rhrBase - 2.5, 1), round(rhrBase + 2.5, 1)], lnrmssd: [round(Math.log(hrvBase) - 0.08, 2), round(Math.log(hrvBase) + 0.08, 2)], sbp: [sbpBase - 5, sbpBase + 7] },
    annotations: (state.annotations[id] ?? []).filter((a) => a.date >= start),
  }
}

function deriveIntraday(id: string, date: string): Intraday {
  const sd = snapDetail(id)
  if (sd?.intraday && date === AS_OF) return fx<Intraday>(sd.intraday)
  if (id === 'P-0007' && date === AS_OF) return fx<Intraday>(intradayFx)
  const tl = deriveTimeline(id, 120)
  const row = tl.rows.find((x) => x.date === date)
  const overnight = row?.rhr ?? tl.baseline_band.rhr[0] + 2.5
  if (row?.missing) {
    return { id, date, interval_min: 5, source: 'simulated', simulated: true, samples: [], overnight_window: ['00:00', '07:00'], overnight_rhr: overnight }
  }
  const r = rng(hashStr(`${id}:${date}`))
  const lr = (lo: number, hi: number) => lo + (hi - lo) * r()
  const until = date === AS_OF ? 6 * 60 + 40 : 24 * 60 - 5
  const samples: Intraday['samples'] = []
  for (let m = 0; m <= until; m += 5) {
    const h = m / 60
    let hr: number
    if (h < 7) hr = overnight + Math.sin(h * 1.3) * 1.6 + lr(-1.8, 1.8)
    else if (h < 9) hr = overnight + 10 + (h - 7) * 4 + lr(-3, 3)
    else if (h < 13) hr = overnight + 16 + lr(-4, 4)
    else if (h < 17.5) hr = overnight + 13 + lr(-4, 4)
    else if (h < 18.2) hr = overnight + 38 + lr(-6, 6)
    else if (h < 22) hr = overnight + 12 + lr(-3, 3)
    else hr = overnight + 5 + lr(-2, 2)
    const hh = String(Math.floor(m / 60)).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    samples.push({ t: `${date}T${hh}:${mm}:00+05:30`, hr: Math.round(hr) })
  }
  return { id, date, interval_min: 5, source: 'simulated', simulated: true, samples, overnight_window: ['00:00', '07:00'], overnight_rhr: round(overnight, 1) }
}

function deriveForecast(id: string): Forecast {
  const sd = snapDetail(id)
  if (sd) return fx<Forecast>(sd.forecast)
  if (id === 'P-0007') return fx<Forecast>(forecastFx)
  const row = triageRow(id)
  if (!row) throw new MockError(404, `Patient ${id} not found`)
  const tl = deriveTimeline(id, 30)
  const hist = tl.rows.slice(-7).map((x) => ({ date: x.date, rhr: x.rhr, sbp: x.sbp_home }))
  const lastR = lastNum(row.sparklines.rhr, 62)
  const lastS = lastNum(row.sparklines.sbp, 136)
  const trendR = (lastR - sparkAt(row.sparklines.rhr, 3, lastR)) / 3
  const trendS = (lastS - sparkAt(row.sparklines.sbp, 3, lastS)) / 3
  const score = row.risk_score ?? 10
  const p = clamp(score / 100, 0.02, 0.95)
  const mk = (last: number, trend: number, spread: number, dec: number): QuantilePoint[] =>
    [1, 2, 3].map((d) => ({ date: addDays(AS_OF, d), p10: round(last + trend * d * 0.8 - spread * d * 0.55, dec), p50: round(last + trend * d * 0.8, dec), p90: round(last + trend * d * 0.8 + spread * d * 0.7, dec) }))
  const confidence: Forecast['confidence'] = row.wear_time_pct_7d < 50 ? 'low' : row.wear_time_pct_7d < 70 ? 'medium' : 'high'
  return {
    id,
    as_of: AS_OF,
    horizon_days: 3,
    history: hist,
    rhr: mk(lastR, trendR, 2.2, 1),
    sbp: mk(lastS, trendS, 5, 0),
    episode_probability: [1, 2, 3].map((d) => ({ date: addDays(AS_OF, d), p: round(p * (0.55 + d * 0.15), 2), band: [round(p * (0.4 + d * 0.15), 2), round(Math.min(0.99, p * (0.7 + d * 0.15)), 2)] })),
    probability_72h: round(p, 2),
    band_72h: [round(Math.max(0.01, p - 0.12), 2), round(Math.min(0.99, p + 0.1), 2)],
    twin_accuracy_7d: { rhr_mae: round(1.4 + (100 - row.wear_time_pct_7d) / 40, 1), sbp_mae: round(3.6 + (100 - row.wear_time_pct_7d) / 25, 1), coverage_p10_p90: round(clamp(0.9 - (100 - row.wear_time_pct_7d) / 200, 0.5, 0.95), 2), label: row.wear_time_pct_7d >= 70 ? 'good' : row.wear_time_pct_7d >= 50 ? 'fair' : 'poor' },
    confidence,
  }
}

function deriveExplain(id: string): Explain {
  const sd = snapDetail(id)
  if (sd) return fx<Explain>(sd.explain)
  if (id === 'P-0007') return fx<Explain>(explainFx)
  const row = triageRow(id)
  if (!row) throw new MockError(404, `Patient ${id} not found`)
  const base = fx<Explain>(explainFx)
  const score = row.risk_score ?? 10
  const k = score / 71
  const dRhr = Math.round(lastNum(row.sparklines.rhr, 62) - firstNum(row.sparklines.rhr, 62))
  const dSbp = lastNum(row.sparklines.sbp, 136) - firstNum(row.sparklines.sbp, 136)
  const hrvFirst = firstNum(row.sparklines.hrv, 40)
  const dHrvPct = Math.round(((hrvFirst - lastNum(row.sparklines.hrv, hrvFirst)) / hrvFirst) * 100)
  const contributors = [
    { feature: 'rhr_dev_3d', label: `Overnight HR ${dRhr >= 0 ? '+' : ''}${dRhr} bpm vs 28-day baseline (3-night mean)`, value: dRhr, shap: round(0.21 * k, 2), direction: 'up' as const, group: 'wearable' as const },
    { feature: 'sbp_slope_7d', label: `Home SBP ${dSbp >= 0 ? 'rising' : 'falling'} ${round(Math.abs(dSbp) / 7, 1)} mmHg/day over 7 days`, value: round(dSbp / 7, 1), shap: round(0.14 * k, 2), direction: 'up' as const, group: 'wearable' as const },
    { feature: 'hrv_trend_7d', label: `HRV ${dHrvPct}% below your 60-day mean`, value: dHrvPct, shap: round(0.09 * k, 2), direction: 'up' as const, group: 'wearable' as const },
    { feature: 'framingham_10y', label: `10-year Framingham risk ${round(6 + k * 12, 1)}%`, value: round(6 + k * 12, 1), shap: round(0.05 * k, 2), direction: 'up' as const, group: 'ehr' as const },
  ]
  return {
    ...base,
    id,
    probability_72h: round(score / 100, 2),
    contributors: contributors.filter((c) => c.shap > 0),
    protective: base.protective,
    rule_state: { ns_state: row.ns_state, rule: base.rule_state.rule, days_in_state: row.ns_state === 'red' ? 2 : row.ns_state === 'yellow' ? 1 : 0 },
    inputs_used: [`${Math.round(20 + k * 8)} nights of HR`, `${Math.round(18 + k * 8)} nights of HRV`, `${Math.round(10 + k * 9)} home BP readings`, `EHR: ${row.conditions.length} conditions, ${row.conditions.includes('Type 2 diabetes') ? 3 : 2} medications, 6 labs`],
    stale_inputs: row.freshness.label === 'fresh' ? [] : ['wearable'],
  }
}

function deriveMe(id: string): MeView {
  const p = derivePatient(id)
  const sd = snapDetail(id)
  const me = fx<MeView>(sd ? sd.me : meFx)
  if (id !== 'P-0007' && !sd) {
    const row = triageRow(id)!
    const first = row.name.split(' ')[0]
    const score = row.risk_score ?? 0
    const dR = Math.round(lastNum(row.sparklines.rhr, 62) - firstNum(row.sparklines.rhr, 62))
    me.id = id
    me.first_name = first
    me.score = { ...me.score, value: row.risk_score, label: score >= 60 ? 'Needs attention' : score >= 30 ? 'Keep an eye' : 'Looking steady', ring_color: row.tier === 'opted_out' ? 'opted_out' : row.tier, nights_available: p.baselines.nights_available, state: p.baselines.nights_available < 7 ? 'calibrating' : 'ready' }
    me.drivers = [
      { label: 'Resting heart rate', value: `${Math.round(lastNum(row.sparklines.rhr, 62))} bpm`, vs_baseline: `${dR >= 0 ? '+' : ''}${dR} bpm`, arrow: dR > 0 ? 'up' : dR < 0 ? 'down' : 'flat', good: dR <= 1 },
      { label: 'Sleep', value: score >= 30 ? '6 h 10 m' : '7 h 05 m', vs_baseline: score >= 30 ? '-50 m' : '+10 m', arrow: score >= 30 ? 'down' : 'up', good: score < 30 },
      { label: 'Steps', value: score >= 30 ? '4,600' : '6,900', vs_baseline: score >= 30 ? '-24%' : '+8%', arrow: score >= 30 ? 'down' : 'up', good: score < 30 },
    ]
    me.sentence = score >= 60
      ? me.sentence
      : score >= 30
        ? { en: 'Your heart rate has been a little higher than usual and you slept less. Please take it easy today and check your BP this evening.', hi: 'आपकी हृदय गति सामान्य से थोड़ी ज़्यादा रही है और नींद कम हुई है। कृपया आज आराम करें और शाम को BP जाँचें।' }
        : { en: 'Everything looks close to your usual. Keep up the walks and take your medicine on time.', hi: 'सब कुछ आपके सामान्य के करीब दिख रहा है। सैर जारी रखें और समय पर दवा लें।' }
    me.freshness = row.freshness
    me.device = { brand: row.device.brand, simulated: row.device.simulated }
    me.contacts = p.emergency_contacts.map((c) => ({ name: c.name.split(' ')[0], relation: c.relation }))
    const sbpNow = lastNum(row.sparklines.sbp, 136)
    me.share_card = { title: `${first}'s day`, lines: [`Heart: ${dR > 1 ? `working harder (+${dR} bpm)` : 'steady'}`, `Sleep: ${me.drivers[1].value}`, `BP: ${sbpNow}/${Math.round(sbpNow * 0.6 + 2)} this morning`], footer: me.share_card.footer }
    me.what_helps = deriveWhatHelps(id)
    if (id === CALIBRATING_ID) {
      me.score = { ...me.score, state: 'calibrating', nights_available: 5, nights_needed: 7 }
      me.drivers = me.drivers.map((d) => ({ ...d, vs_baseline: 'learning', arrow: 'flat', good: true }))
      me.sentence = {
        en: 'We are still learning your normal. Two more nights of wearing your watch and your reflection will be ready.',
        hi: 'हम अभी आपका सामान्य सीख रहे हैं। दो और रात घड़ी पहनें, फिर आपका प्रतिबिम्ब तैयार होगा।',
      }
      me.what_helps = []
    }
  }
  if (!p.consent.ai_predictions) {
    me.score = { ...me.score, value: null, label: 'Predictions off', ring_color: 'opted_out' }
    me.sentence = { en: 'Predictions are switched off for you. Your doctor still sees your readings.', hi: 'आपके लिए पूर्वानुमान बंद हैं। आपके डॉक्टर अभी भी आपकी रीडिंग देख सकते हैं।' }
  }
  me.checkin.pending = !state.checkinDone[id]
  return me
}

// ----------------------------------------------------------------- v1.1: personal physiology and twin summary

const PAIRS = ['steps_sbp', 'sleep_rhr', 'sleep_hrv', 'steps_rhr'] as const

function derivePhysiology(id: string): Physiology {
  const sd = snapDetail(id)
  if (sd) return fx<Physiology>(sd.physiology)
  if (id === 'P-0007') return fx<Physiology>(physiologyFx)
  const row = triageRow(id)
  if (!row) throw new MockError(404, `Patient ${id} not found`)
  const base = fx<Physiology>(physiologyFx)
  const r = rng(hashStr(`${id}:phys`))
  const p = derivePatient(id)
  const first = row.name.split(' ')[0]
  const calibrating = id === CALIBRATING_ID
  const responses: PhysiologyResponse[] = base.responses.map((src) => {
    const k = 0.55 + r() * 1.1
    const personal = round(src.cohort * k, 2)
    const width = Math.abs(src.cohort) * (calibrating ? 1.6 : 0.35 + r() * 0.45)
    const interval: [number, number] = [round(personal - width, 2), round(personal + width, 2)]
    const excludesZero = interval[0] * interval[1] > 0
    const evidence = calibrating ? 'weak' : excludesZero && width < Math.abs(personal) * 0.8 ? 'strong' : excludesZero ? 'moderate' : 'weak'
    const mag = Math.abs(personal)
    const most = Math.abs(src.cohort)
    const unitWord = src.unit === '% HRV' ? '%' : ` ${src.unit}`
    const verb = personal < 0 ? 'lowers' : 'lifts'
    const plain =
      src.key === 'steps_sbp' || src.key === 'steps_rhr'
        ? `Every extra 1,000 steps usually ${verb} ${first}'s ${src.outcome_label.toLowerCase()} by about ${mag.toFixed(1)}${unitWord}. Most people: ${most.toFixed(1)}${unitWord}.`
        : `An extra hour of sleep usually ${verb} ${first}'s ${src.outcome_label.toLowerCase()} by about ${mag.toFixed(1)}${unitWord}. Most people: ${most.toFixed(1)}${unitWord}.`
    return { ...src, personal, interval, relative_to_cohort: round(personal / src.cohort, 2), evidence, plain }
  })
  const ranked = [...responses].filter((x) => x.outcome === 'sbp' || x.outcome === 'rhr').sort((a, b) => b.relative_to_cohort - a.relative_to_cohort)
  const best = ranked.find((x) => x.evidence !== 'weak') ?? null
  const her = p.sex === 'F' ? 'her' : p.sex === 'M' ? 'his' : 'their'
  return {
    ...base,
    id,
    calm_days_used: calibrating ? 3 : Math.round(p.baselines.nights_available * (0.7 + r() * 0.15)),
    days_available: p.baselines.nights_available,
    responses,
    best_lever: best
      ? {
          key: best.key,
          lever: best.lever,
          plain:
            best.lever === 'walking'
              ? `Walking is ${first}'s strongest lever. A 30-minute walk (about 3,500 steps) is expected to lower ${her} ${best.outcome === 'sbp' ? 'morning BP' : 'night-time heart rate'} by about ${(Math.abs(best.personal) * 3.5).toFixed(best.outcome === 'sbp' ? 0 : 1)} ${best.unit}.`
              : `Sleep is ${first}'s strongest lever. An extra hour is expected to lower ${her} ${best.outcome === 'sbp' ? 'morning BP' : 'next-night heart rate'} by about ${Math.abs(best.personal).toFixed(1)} ${best.unit}.`,
        }
      : null,
    validation: null,
  }
}

function deriveWhatHelps(id: string): WhatHelps[] {
  const ph = derivePhysiology(id)
  const out: WhatHelps[] = []
  const sorted = [...ph.responses].filter((x) => x.evidence !== 'weak').sort((a, b) => (a.evidence === b.evidence ? b.relative_to_cohort - a.relative_to_cohort : a.evidence === 'strong' ? -1 : 1))
  for (const x of sorted.slice(0, 3)) {
    const mag = Math.abs(x.personal)
    if (x.key === 'steps_sbp') out.push({ lever: 'walking', en: `A 30-minute walk usually brings your morning BP down by about ${Math.round(mag * 3.5)} mmHg.`, hi: `30 मिनट की सैर से आपका सुबह का BP आम तौर पर लगभग ${Math.round(mag * 3.5)} mmHg कम होता है।`, strength: x.evidence })
    else if (x.key === 'sleep_rhr') out.push({ lever: 'sleep', en: `An extra hour of sleep usually calms your heart rate the next night by about ${mag.toFixed(1)} beats a minute.`, hi: `एक घंटा ज़्यादा सोने से अगली रात आपकी हृदय गति आम तौर पर लगभग ${mag.toFixed(1)} धड़कन प्रति मिनट कम होती है।`, strength: x.evidence })
    else if (x.key === 'sleep_hrv') out.push({ lever: 'sleep', en: 'Sleeping a little longer also helps your heart recover overnight.', hi: 'थोड़ा ज़्यादा सोने से रात में आपका दिल बेहतर आराम करता है।', strength: x.evidence })
    else out.push({ lever: 'walking', en: 'Daily walks keep your resting heart rate a little lower.', hi: 'रोज़ की सैर से आराम की हृदय गति थोड़ी कम रहती है।', strength: x.evidence })
  }
  return out
}

function deriveSummary(id: string): TwinSummary {
  const sd = snapDetail(id)
  if (id === 'P-0007' || sd) {
    const s = fx<TwinSummary>(sd ? sd.summary : summaryFx)
    const p = derivePatient(id)
    if (!p.consent.ai_predictions) return optedOutSummary(p)
    return s
  }
  const p = derivePatient(id)
  if (!p.consent.ai_predictions) return optedOutSummary(p)
  const f = deriveForecast(id)
  const x = deriveExplain(id)
  const ph = derivePhysiology(id)
  const first = p.name.split(' ')[0]
  const her = p.sex === 'F' ? 'her' : p.sex === 'M' ? 'his' : 'their'
  const tier = p.current.tier
  const ratio = f.probability_72h / Math.max(0.01, x.base_rate)
  const times = ratio >= 1.5 ? `, about ${Math.round(ratio)} times ${her} usual ${fmtP(x.base_rate)}` : `, close to ${her} usual ${fmtP(x.base_rate)}`
  const reasons = x.contributors.slice(0, 2).map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1))
  const calibrating = id === CALIBRATING_ID
  return {
    id,
    headline: calibrating ? 'Still learning this person\'s normal' : tier === 'urgent' ? 'Strain episode likely in the next 72 hours' : tier === 'watch' ? 'Worth a check-in this week' : 'Steady, close to usual',
    tier,
    sentences: calibrating
      ? [`${first} has ${p.baselines.nights_available} nights of data. The twin needs 7 before it scores against ${her} own baseline.`, 'Until then urgent alerts stay off and the record stream sets the static risk.', 'Ask for two more nights of wear.']
      : [
          `${first}'s twin puts the chance of a strain episode in the next 72 hours at ${fmtP(f.probability_72h)}${times}.`,
          `The main reasons are ${reasons.join(' and ')}.`,
          bestLeverSentence(ph, her),
        ],
    next_step: calibrating ? 'No action needed. Remind them to wear the watch overnight.' : tier === 'urgent' ? 'Call today, check medicines are being taken, and ask for an evening BP reading.' : tier === 'watch' ? 'Send a check-in message and review again tomorrow.' : 'No action needed. Review at the next visit.',
    streams: {
      record: [...p.ehr.conditions.slice(0, 2).map((c) => c.display), `Framingham 10-year risk ${p.static_risk.framingham_10y_pct}%`],
      wearable: x.inputs_used.filter((i) => !i.startsWith('EHR')).map((i) => i.replace('of HR', 'of heart rate')),
    },
    usual_probability: x.base_rate,
  }
}

function optedOutSummary(p: Patient): TwinSummary {
  const first = p.name.split(' ')[0]
  return {
    id: p.id,
    headline: 'Predictions are switched off',
    tier: 'opted_out',
    sentences: [`${first} has opted out of predictions. The twin still keeps the record and the readings, but it does not score or forecast.`],
    next_step: 'Review readings directly on the Twin tab.',
    streams: { record: p.ehr.conditions.slice(0, 2).map((c) => c.display), wearable: [`${p.baselines.nights_available} nights of heart rate`] },
    usual_probability: 0,
  }
}

const fmtP = (p: number) => `${Math.round(p * 100)}%`

function bestLeverSentence(ph: Physiology, her: string): string {
  const best = ph.responses.find((x) => x.key === ph.best_lever?.key)
  if (!best) return 'No personal lever has strong evidence yet.'
  const Her = her.charAt(0).toUpperCase() + her.slice(1)
  if (best.lever === 'walking') {
    const what = best.outcome === 'sbp' ? 'morning BP' : 'night-time heart rate'
    return `${Her} strongest lever is walking: 30 minutes a day is expected to lower ${her} ${what} by about ${(Math.abs(best.personal) * 3.5).toFixed(best.outcome === 'sbp' ? 0 : 1)} ${best.unit}.`
  }
  return `${Her} strongest lever is sleep: an extra hour is expected to lower ${her} next-night heart rate by about ${Math.abs(best.personal).toFixed(1)} ${best.unit}.`
}

/** Day-3 effects of a lever for this person and for most people, from the physiology slopes. */
function leverEffects(id: string, lever: keyof SimulateBody, value: number | boolean, currentAdh: number): { personal: { rhr: number; sbp: number }; cohort: { rhr: number; sbp: number } } {
  const ph = derivePhysiology(id)
  const get = (key: (typeof PAIRS)[number]) => ph.responses.find((x) => x.key === key)
  if (lever === 'walk_minutes_per_day' && typeof value === 'number') {
    const k = (value * 117) / 1000
    const sbp = get('steps_sbp')
    const rhr = get('steps_rhr')
    return {
      personal: { sbp: round((sbp?.personal ?? -1.1) * k, 1), rhr: round((rhr?.personal ?? -0.28) * k, 1) },
      cohort: { sbp: round((sbp?.cohort ?? -1.1) * k, 1), rhr: round((rhr?.cohort ?? -0.28) * k, 1) },
    }
  }
  if (lever === 'sleep_extra_hours' && typeof value === 'number') {
    const rhr = get('sleep_rhr')
    return {
      personal: { rhr: round((rhr?.personal ?? -1.02) * value, 1), sbp: round(-1.2 * value, 1) },
      cohort: { rhr: round((rhr?.cohort ?? -1.02) * value, 1), sbp: round(-1.2 * value, 1) },
    }
  }
  if (lever === 'bp_med_adherence_pct' && typeof value === 'number') {
    const k = (value - currentAdh) / 28
    const e = { sbp: round(-8 * k, 1), rhr: round(-1 * k, 1) }
    return { personal: e, cohort: e }
  }
  if (lever === 'sodium_reduction' && value) return { personal: { sbp: -4, rhr: 0 }, cohort: { sbp: -4, rhr: 0 } }
  if (lever === 'alcohol_free' && value) return { personal: { sbp: -2, rhr: -1 }, cohort: { sbp: -2, rhr: -1 } }
  return { personal: { sbp: 0, rhr: 0 }, cohort: { sbp: 0, rhr: 0 } }
}

class MockError extends Error {
  status: number
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

function findAlert(id: string): Alert {
  const a = state.alerts.find((x) => x.id === id)
  if (!a) throw new MockError(404, `Alert ${id} not found`)
  return a
}

function alertAudit(a: Alert, action: string, actor: string, detail: string): AuditEntry[] {
  return [
    addAudit({ actor, actor_type: 'clinician', patient_id: a.patient_id, action, object: a.id, detail, consent_basis: 'ai_predictions', channel: null }),
  ]
}

function createEscalationFor(patientId: string, trigger: Escalation['trigger'], alertId: string | null, location: Escalation['location'], by: string): Escalation {
  const p = derivePatient(patientId)
  const id = `ES-${String(state.nextEscalation++).padStart(4, '0')}`
  const startedAt = nowIso()
  const es: Escalation = {
    id,
    patient_id: patientId,
    patient_name: p.name,
    trigger,
    started_at: startedAt,
    state: 'contact_1',
    countdown_ends_at: startedAt,
    steps: buildSteps(p, startedAt),
    location: location ?? null,
    actions: { call_112_url: 'tel:112', uhi_ambulance_url: `https://uhi.example/ambulance?ref=${id}`, mock: true },
    resolved_by: null,
    outcome: null,
  }
  if (trigger === 'clinician') {
    es.steps[0].status = 'skipped'
    es.steps[0].detail = 'Started by clinician, patient prompt skipped'
  }
  state.escalations.unshift(es)
  let alert = alertId ? state.alerts.find((a) => a.id === alertId) : undefined
  if (!alert) {
    const kind: AlertKind = trigger === 'clinician' ? 'model' : trigger
    alert = {
      id: `AL-0${state.nextAlert++}`,
      patient_id: patientId,
      patient_name: p.name,
      created_at: startedAt,
      tier: 'urgent',
      kind,
      title: trigger === 'sos' ? 'SOS pressed by patient' : trigger === 'fall' ? 'Fall event from the phone' : trigger === 'acute' ? 'Live HR above 140 bpm for 10 minutes' : 'Escalation started',
      reason: trigger === 'sos' ? 'Patient held SOS; no response to the 60 s check-in' : 'Escalation ladder started',
      status: 'escalated',
      confidence: 'high',
      snoozed_until: null,
      acknowledged_by: null,
      escalation_id: id,
      owner: p.clinician.name,
    }
    state.alerts.unshift(alert)
    addAudit({ actor: 'system', actor_type: 'system', patient_id: patientId, action: 'alert.created', object: alert.id, detail: `kind=${kind} tier=urgent trigger=${trigger}`, consent_basis: 'emergency_contacts', channel: null })
  } else {
    alert.status = 'escalated'
    alert.escalation_id = id
  }
  addAudit({ actor: by, actor_type: by === 'patient' ? 'patient' : by === 'system' ? 'system' : 'clinician', patient_id: patientId, action: 'escalation.started', object: id, detail: `trigger=${trigger} state=contact_1`, consent_basis: 'emergency_contacts', channel: null })
  addAudit({ actor: 'system', actor_type: 'system', patient_id: patientId, action: 'escalation.contact_1', object: id, detail: es.steps[1].detail, consent_basis: 'emergency_contacts', channel: 'sms' })
  return es
}

// ----------------------------------------------------------------- acute rule (live stream)

function raiseAcuteAlert(patientId: string) {
  const p = derivePatient(patientId)
  const alert: Alert = {
    id: `AL-0${state.nextAlert++}`,
    patient_id: patientId,
    patient_name: p.name,
    created_at: nowIso(),
    tier: 'urgent',
    kind: 'acute',
    title: 'Live HR above 140 bpm for 10 minutes',
    reason: 'Streamed HR at or above 140 bpm for ten consecutive 5-minute samples while at rest',
    status: 'open',
    confidence: 'high',
    snoozed_until: null,
    acknowledged_by: null,
    escalation_id: null,
    owner: p.clinician.name,
  }
  state.alerts.unshift(alert)
  addAudit({ actor: 'system', actor_type: 'system', patient_id: patientId, action: 'alert.created', object: alert.id, detail: 'kind=acute tier=urgent rule=hr>=140 for 10 min', consent_basis: 'wearable', channel: null })
}

// ----------------------------------------------------------------- simulate

/** Replays the real model's what-if for snapshot patients. The grid covers the walking and sleep
 * sliders, salt and alcohol; medicine adherence is added with the backend's linear formula
 * (8 mmHg for going from no doses to every dose, half on day 1, full from day 2). */
function simulateFromSnapshot(id: string, body: SimulateBody): SimulateResponse | null {
  const grid = S?.simulate_grid[id]
  if (!grid?.length) return null
  const walk = Math.round(Math.min(60, Math.max(0, body.walk_minutes_per_day ?? 0)) / 5) * 5
  const sleep = Math.round(Math.min(2, Math.max(0, body.sleep_extra_hours ?? 0)) * 2) / 2
  const hit = grid.find((g) => g.body.walk_minutes_per_day === walk && g.body.sleep_extra_hours === sleep && g.body.sodium_reduction === !!body.sodium_reduction && g.body.alcohol_free === !!body.alcohol_free)
  if (!hit) return null
  const r = fx<SimulateResponse>(hit.response)
  const p = derivePatient(id)
  const cur = p.ehr.medications.find((m) => m.class === 'CCB' || m.class === 'ACEi' || m.class === 'ARB')?.adherence_30d_pct ?? 72
  const adh = body.bp_med_adherence_pct
  if (adh != null && adh > cur) {
    const gain = round((-(adh - cur) / 100) * 8, 1)
    const ramp = [0.5, 1, 1]
    r.sbp = r.sbp.map((q, i) => ({ ...q, p10: Math.round(q.p10 + gain * ramp[i]), p50: Math.round(q.p50 + gain * ramp[i]), p90: Math.round(q.p90 + gain * ramp[i]) }))
    r.scenario.sbp_p50_day3 = r.sbp[r.sbp.length - 1].p50
    r.delta.sbp_p50_day3 = round(r.scenario.sbp_p50_day3 - r.baseline.sbp_p50_day3, 1)
    r.levers_applied.push({ lever: 'bp_med_adherence_pct', value: adh, personalised: false, personal_effect: { sbp: gain }, cohort_effect: { sbp: gain }, effect: `Every dose taken: morning BP ${gain > 0 ? '+' : ''}${gain.toFixed(1)} mmHg (population estimate)` } as LeverApplied)
  }
  return r
}

function simulate(id: string, body: SimulateBody): SimulateResponse {
  const snap = simulateFromSnapshot(id, body)
  if (snap) return snap
  const f = deriveForecast(id)
  const p = derivePatient(id)
  const currentAdh = p.ehr.medications.find((m) => m.class === 'CCB' || m.class === 'ACEi' || m.class === 'ARB')?.adherence_30d_pct ?? 72
  const base = { probability_72h: f.probability_72h, band: f.band_72h, sbp_p50_day3: f.sbp[2].p50, rhr_p50_day3: f.rhr[2].p50 }
  const first = p.name.split(' ')[0]
  let dsbp = 0
  let drhr = 0
  const levers: LeverApplied[] = []
  const add = (lever: keyof SimulateBody, value: number | boolean, effect: (e: { rhr: number; sbp: number }) => string) => {
    const e = leverEffects(id, lever, value, currentAdh)
    dsbp += e.personal.sbp
    drhr += e.personal.rhr
    levers.push({ lever, value, effect: effect(e.personal), personal_effect: e.personal, cohort_effect: e.cohort })
  }
  const walk = body.walk_minutes_per_day ?? 0
  if (walk > 0) add('walk_minutes_per_day', walk, (e) => `About ${(walk * 117).toLocaleString('en-IN')} more steps a day: ${first}'s BP ${fmtSigned1(e.sbp)} mmHg and heart rate ${fmtSigned1(e.rhr)} bpm by day 3`)
  const sleep = body.sleep_extra_hours ?? 0
  if (sleep > 0) add('sleep_extra_hours', sleep, (e) => `${sleep} h more sleep: heart rate ${fmtSigned1(e.rhr)} bpm by night 3`)
  const adh = body.bp_med_adherence_pct
  if (adh !== undefined && adh !== currentAdh) add('bp_med_adherence_pct', adh, (e) => `BP medicine taken ${adh}% of days (now ${currentAdh}%): BP ${fmtSigned1(e.sbp)} mmHg by day 3`)
  if (body.sodium_reduction) add('sodium_reduction', true, (e) => `Less salt: BP ${fmtSigned1(e.sbp)} mmHg by day 3`)
  if (body.alcohol_free) add('alcohol_free', true, (e) => `No alcohol: heart rate ${fmtSigned1(e.rhr)} bpm overnight, BP ${fmtSigned1(e.sbp)} mmHg`)
  // The 72 h chance moves only through causes, so it barely shifts once an episode is under way;
  // the ordinary-week readout below carries the size of the effect.
  const underWay = base.probability_72h >= 0.3
  const dp = (dsbp * 0.022 + drhr * 0.03) * (underWay ? 0.1 : 0.6)
  const prob = round(clamp(base.probability_72h + dp, 0.03, 0.97), 2)
  const scenario = {
    probability_72h: prob,
    band: [round(clamp(base.band[0] + dp, 0.01, 0.95), 2), round(clamp(base.band[1] + dp, 0.05, 0.99), 2)] as [number, number],
    sbp_p50_day3: Math.round(base.sbp_p50_day3 + dsbp),
    rhr_p50_day3: round(base.rhr_p50_day3 + drhr, 1),
  }
  const shift = (pts: QuantilePoint[], d: number, dec: number): QuantilePoint[] =>
    pts.map((pt, i) => ({ date: pt.date, p10: round(pt.p10 + (d * (i + 1)) / 3, dec), p50: round(pt.p50 + (d * (i + 1)) / 3, dec), p90: round(pt.p90 + (d * (i + 1)) / 3, dec) }))
  // An ordinary week: the person's usual weekly chance, scaled by the change in its causes.
  const x = deriveExplain(id)
  const weekBase = round(Math.max(0.002, x.base_rate * 0.15), 4)
  const weekScenario = round(weekBase * Math.exp(dsbp * 0.07 + drhr * 0.1), 4)
  const rel = round(weekScenario / weekBase - 1, 3)
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  const usual_week = levers.length
    ? { baseline: weekBase, scenario: weekScenario, relative_change: rel, plain: `On an ordinary week, ${first}'s chance of a strain episode would go from ${pct(weekBase)} to ${pct(weekScenario)} (${rel > 0 ? '+' : rel < 0 ? '-' : ''}${Math.abs(Math.round(rel * 100))}%).` }
    : null
  return {
    baseline: base,
    scenario,
    delta: { probability_72h: round(prob - base.probability_72h, 2), sbp_p50_day3: scenario.sbp_p50_day3 - base.sbp_p50_day3, rhr_p50_day3: round(scenario.rhr_p50_day3 - base.rhr_p50_day3, 1) },
    levers_applied: levers,
    rhr: shift(f.rhr, drhr, 1),
    sbp: shift(f.sbp, dsbp, 0),
    usual_week,
    note: 'Assumes the change is kept up for a week. The 72 hour risk moves through what starts strain in the twin (a week of sleep and activity, missed doses); it cannot undo strain already under way. Walking and sleep move the vitals by the slopes the twin learned for this person; medicine, salt and alcohol use population estimates. Model estimates on synthetic data, not clinical advice.',
    personalised: true,
  }
}

const fmtSigned1 = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(1)}`

// ----------------------------------------------------------------- thresholds preview

function previewThresholds(draft: Partial<Thresholds>): ThresholdPreview {
  const cur = state.thresholds
  const d = { ...cur, ...draft }
  const current = { alerts: 23, per_patient_day: 0.0137, would_have_caught_events: 11, events: 13 }
  const factor =
    Math.pow(cur.watch / d.watch, 1.2) *
    Math.pow(cur.urgent / d.urgent, 0.6) *
    Math.pow(cur.ns_rhr_delta_red / d.ns_rhr_delta_red, 1.4) *
    Math.pow(cur.ns_rhr_delta_yellow / d.ns_rhr_delta_yellow, 0.4) *
    Math.pow(cur.ns_consecutive_nights / d.ns_consecutive_nights, 1.1) *
    Math.pow(cur.hrv_swc_multiplier / d.hrv_swc_multiplier, 0.3) *
    (d.min_confidence_for_urgent === 'high' ? 0.85 : d.min_confidence_for_urgent === 'low' ? 1.15 : 1)
  const alerts = Math.max(0, Math.round(current.alerts * factor))
  const sens = clamp((current.would_have_caught_events / current.events) * Math.pow(Math.max(0.05, factor), 0.35), 0, 1)
  const caught = Math.min(current.events, Math.round(current.events * sens))
  return {
    window_days: 14,
    scope: 'cohort',
    current,
    draft: { alerts, per_patient_day: round(alerts / 1680, 4), would_have_caught_events: caught, events: current.events },
    delta_alerts_pct: round(((alerts - current.alerts) / current.alerts) * 100, 1),
    sensitivity_change: round(caught / current.events - current.would_have_caught_events / current.events, 3),
  }
}

// ----------------------------------------------------------------- triage with state applied

function triage(q: { tier?: string; sort?: string; q?: string } = {}): TriageResponse {
  tickEscalations()
  const src = fx<TriageResponse>(patientsFx)
  let rows = src.patients.map((p) => {
    const consent = state.consent[p.id]
    if (consent && !consent.ai_predictions) {
      p.risk_score = null
      p.tier = 'opted_out'
    }
    const open = state.alerts.find((a) => a.patient_id === p.id && (a.status === 'open' || a.status === 'acknowledged' || a.status === 'escalated' || a.status === 'snoozed'))
    p.open_alert_id = open?.id ?? (p.open_alert_id && state.alerts.some((a) => a.id === p.open_alert_id && a.status === 'resolved') ? null : p.open_alert_id)
    const es = state.escalations.find((e) => e.patient_id === p.id && e.state !== 'resolved' && e.state !== 'cancelled')
    p.escalation_status = es ? es.state : null
    return p
  })
  if (q.tier) rows = rows.filter((p) => p.tier === q.tier)
  if (q.q) {
    const needle = q.q.toLowerCase()
    rows = rows.filter((p) => p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle) || p.city.toLowerCase().includes(needle))
  }
  if (q.sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name))
  else if (q.sort === 'freshness') rows.sort((a, b) => a.freshness.minutes_ago - b.freshness.minutes_ago)
  else rows.sort((a, b) => (b.risk_score ?? -1) - (a.risk_score ?? -1))
  return { ...src, patients: rows }
}

// ----------------------------------------------------------------- client

const rawClient: ApiClient = {
  async meta() {
    await latency()
    return fx<Meta>(metaFx)
  },
  async health() {
    await latency()
    return { ok: true, model_loaded: true, cohort_loaded: true }
  },
  async patients(q) {
    await latency()
    return triage(q)
  },
  async patient(id) {
    await latency()
    return derivePatient(id)
  },
  async timeline(id, days, reveal) {
    await latency()
    const t = deriveTimeline(id, days)
    if (reveal && id === 'P-0007') t.labels = [{ date: '2026-10-13', kind: 'strain_episode', label: 'Synthetic ground-truth: strain episode onset', visible_to_clinician: false }]
    return t
  },
  async intraday(id, date) {
    await latency()
    return deriveIntraday(id, date)
  },
  async forecast(id) {
    await latency()
    return deriveForecast(id)
  },
  async explain(id) {
    await latency()
    return deriveExplain(id)
  },
  async physiology(id, reveal) {
    await latency()
    const ph = derivePhysiology(id)
    if (reveal) ph.validation = { true: Object.fromEntries(ph.responses.map((x) => [x.key, round(x.personal * (0.9 + (hashStr(id + x.key) % 20) / 100), 2)])) }
    return ph
  },
  async summary(id) {
    await latency()
    return deriveSummary(id)
  },
  async simulate(id, body) {
    await sleep(90 + Math.random() * 120)
    return simulate(id, body)
  },
  async annotatePatient(id, body) {
    await latency()
    const list = (state.annotations[id] ??= [])
    list.push({ date: body.date, kind: body.kind, label: body.label, by: body.by })
    addAudit({ actor: body.by, actor_type: 'clinician', patient_id: id, action: 'annotation.added', object: null, detail: `kind=${body.kind} label="${body.label}"`, consent_basis: 'ehr', channel: null })
    return { ok: true }
  },
  async consent(id) {
    await latency()
    return clone(state.consent[id] ?? derivePatient(id).consent)
  },
  async updateConsent(id, body) {
    await latency()
    const prev = state.consent[id] ?? derivePatient(id).consent
    const next: Consent = { ...prev, ...body, updated_at: nowIso() }
    delete (next as unknown as { withdraw?: boolean }).withdraw
    state.consent[id] = next
    addAudit({ actor: 'patient', actor_type: 'patient', patient_id: id, action: body.withdraw ? 'consent.withdrawn' : 'consent.updated', object: null, detail: body.withdraw ? 'wearable rows soft-deleted (demo)' : `ehr=${next.ehr} wearable=${next.wearable} ai_predictions=${next.ai_predictions} emergency_contacts=${next.emergency_contacts}`, consent_basis: 'consent', channel: null })
    return clone(next)
  },
  // The hosted demo ships real FHIR downloads for the people in S.exports; elsewhere it has none.
  exportWellnessUrl: (id) => (S ? (S.exports.includes(id) ? `${import.meta.env.BASE_URL}demo/exports/${id}-wellnessrecord.json` : '') : `/api/patients/${id}/export/wellnessrecord`),
  exportEhrUrl: (id) => (S ? (S.exports.includes(id) ? `${import.meta.env.BASE_URL}demo/exports/${id}-ehr.json` : '') : `/api/patients/${id}/export/ehr`),

  async alerts(q = {}) {
    await latency()
    tickEscalations()
    let list = clone(state.alerts)
    if (q.status && q.status !== 'all') list = list.filter((a) => a.status === q.status)
    if (q.patient_id) list = list.filter((a) => a.patient_id === q.patient_id)
    return { budget: fx<AlertBudget>(alertsFx.budget), alerts: list }
  },
  async ackAlert(id, body) {
    await latency()
    const a = findAlert(id)
    a.status = 'acknowledged'
    a.acknowledged_by = body.by
    return { ...clone(a), audit: alertAudit(a, 'alert.acknowledged', body.by, body.note ?? 'Acknowledged') }
  },
  async snoozeAlert(id, body) {
    await latency()
    const a = findAlert(id)
    a.status = 'snoozed'
    a.snoozed_until = nowIso(body.hours * 3600000)
    return { ...clone(a), audit: alertAudit(a, 'alert.snoozed', body.by, `hours=${body.hours}`) }
  },
  async escalateAlert(id, body) {
    await latency()
    const a = findAlert(id)
    const es = createEscalationFor(a.patient_id, 'clinician', a.id, null, body.by)
    const audit = alertAudit(a, 'alert.escalated', body.by, body.reason)
    return { ...clone(es), audit }
  },
  async resolveAlert(id, body) {
    await latency()
    const a = findAlert(id)
    a.status = 'resolved'
    a.outcome = body.outcome
    if (a.escalation_id) {
      const es = state.escalations.find((e) => e.id === a.escalation_id)
      if (es && es.state !== 'resolved' && es.state !== 'cancelled') {
        es.state = body.outcome === 'false_alarm' ? 'cancelled' : 'resolved'
        es.resolved_by = body.by
        es.outcome = body.outcome
      }
    }
    return { ...clone(a), audit: alertAudit(a, 'alert.resolved', body.by, `outcome=${body.outcome}${body.note ? ` note="${body.note}"` : ''}`) }
  },

  async thresholds() {
    await latency()
    return clone(state.thresholds)
  },
  async previewThresholds(draft) {
    await sleep(120)
    return previewThresholds(draft)
  },
  async applyThresholds(draft) {
    await latency()
    const { patient_id: _pid, ...rest } = draft
    state.thresholds = { ...state.thresholds, ...rest }
    addAudit({ actor: 'Dr Kavya Rao', actor_type: 'clinician', patient_id: null, action: 'thresholds.updated', object: null, detail: Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(' '), consent_basis: null, channel: null })
    return clone(state.thresholds)
  },

  async createEscalation(body) {
    await latency()
    return clone(createEscalationFor(body.patient_id, body.trigger, body.alert_id, body.location ?? null, body.by))
  },
  async escalation(id) {
    await sleep(60)
    tickEscalations()
    const es = state.escalations.find((e) => e.id === id)
    if (!es) throw new MockError(404, `Escalation ${id} not found`)
    return clone(es)
  },
  async escalations(status) {
    await sleep(60)
    tickEscalations()
    const list = status === 'active' ? state.escalations.filter((e) => e.state !== 'resolved' && e.state !== 'cancelled') : state.escalations
    return clone(list)
  },
  async respondEscalation(id, body) {
    await latency()
    tickEscalations()
    const es = state.escalations.find((e) => e.id === id)
    if (!es) throw new MockError(404, `Escalation ${id} not found`)
    const actorType: AuditEntry['actor_type'] = body.by === 'patient' ? 'patient' : body.by.startsWith('contact') ? 'contact' : 'clinician'
    const finish = (newState: Escalation['state'], outcome: Escalation['outcome']) => {
      es.state = newState
      es.resolved_by = body.by
      es.outcome = outcome
      for (const s of es.steps) if (s.status === 'pending') s.status = 'skipped'
      const alert = state.alerts.find((a) => a.escalation_id === es.id)
      if (alert) {
        alert.status = 'resolved'
        alert.outcome = outcome === 'im_ok' ? 'false_alarm' : (outcome as AlertOutcome)
      }
    }
    switch (body.action) {
      case 'im_ok':
        finish('resolved', 'im_ok')
        break
      case 'acknowledged': {
        const cur = es.steps.find((s) => s.state === es.state)
        if (cur) cur.status = 'acknowledged'
        break
      }
      case 'reached_patient':
      case 'resolved':
        finish('resolved', 'handled')
        break
      case 'false_alarm':
        finish('cancelled', 'false_alarm')
        break
    }
    addAudit({ actor: body.by, actor_type: actorType, patient_id: es.patient_id, action: `escalation.${body.action}`, object: es.id, detail: body.note ?? `state=${es.state}`, consent_basis: 'emergency_contacts', channel: null })
    return clone(es)
  },

  async audit(q = {}) {
    await latency()
    tickEscalations()
    let list = state.audit
    if (q.patient_id) list = list.filter((e) => e.patient_id === q.patient_id)
    return { entries: clone(list.slice(0, q.limit ?? 100)) }
  },

  async me(id) {
    await latency()
    return deriveMe(id)
  },
  async checkin(id, body) {
    await latency()
    state.checkinDone[id] = true
    addAudit({ actor: 'patient', actor_type: 'patient', patient_id: id, action: 'checkin.answered', object: null, detail: `answer=${body.answer}${body.note ? ` note="${body.note}"` : ''}`, consent_basis: 'wearable', channel: null })
    if (body.answer !== 'Fine') {
      const p = derivePatient(id)
      const alert: Alert = {
        id: `AL-0${state.nextAlert++}`,
        patient_id: id,
        patient_name: p.name,
        created_at: nowIso(),
        tier: 'watch',
        kind: 'caregiver',
        title: `Check-in: ${body.answer.toLowerCase()}`,
        reason: `Patient answered "${body.answer}" to the daily check-in${body.note ? `: ${body.note}` : ''}`,
        status: 'open',
        confidence: 'high',
        snoozed_until: null,
        acknowledged_by: null,
        escalation_id: null,
        owner: p.clinician.name,
      }
      state.alerts.unshift(alert)
      addAudit({ actor: 'system', actor_type: 'system', patient_id: id, action: 'alert.created', object: alert.id, detail: `tier=watch kind=caregiver answer=${body.answer}`, consent_basis: 'ai_predictions', channel: null })
      return { ok: true, alert_created: true, alert_id: alert.id }
    }
    return { ok: true, alert_created: false, alert_id: null }
  },
  async annotateMe(id, body) {
    await latency()
    const list = (state.annotations[id] ??= [])
    list.push({ date: body.date, kind: body.kind, label: body.label, by: 'patient' })
    addAudit({ actor: 'patient', actor_type: 'patient', patient_id: id, action: 'annotation.added', object: null, detail: `kind=${body.kind} label="${body.label}"`, consent_basis: 'wearable', channel: null })
    return { ok: true }
  },

  async model() {
    await latency()
    return fx<ModelCard>(modelFx)
  },

  async injectStream(id, scenario) {
    await sleep(80)
    state.streamScenario[id] = scenario
    return { ok: true }
  },
  openStream(id, onSample, onStatus) {
    // Local synthesiser: one "5-minute" sample every 2 s, continuing from the last intraday sample.
    const intraday = deriveIntraday(id, AS_OF)
    const last = intraday.samples[intraday.samples.length - 1]
    let t = last ? new Date(last.t).getTime() : Date.now()
    let hr = last?.hr ?? Math.round(intraday.overnight_rhr + 8)
    let burst = 0
    const r = rng(hashStr(id + ':stream') ^ (Date.now() & 0xffff))
    const timer = window.setInterval(() => {
      t += 5 * 60 * 1000
      const scenario = state.streamScenario[id] ?? 'normal'
      if (scenario === 'acute_tachycardia' && burst === 0) burst = 10
      if (scenario === 'bradycardia' && burst === 0) burst = -10
      let target: number
      if (burst > 0) {
        target = 140 + Math.round(r() * 12)
        burst -= 1
        if (burst === 0) {
          state.streamScenario[id] = 'normal'
          sync()
          raiseAcuteAlert(id)
          commit()
        }
      } else if (burst < 0) {
        target = 42 + Math.round(r() * 6)
        burst += 1
        if (burst === 0) state.streamScenario[id] = 'normal'
      } else {
        target = intraday.overnight_rhr + 10 + Math.round((r() - 0.5) * 8)
      }
      hr = Math.round(hr + (target - hr) * 0.7)
      const ist = new Date(t + 5.5 * 3600000)
      const iso = `${ist.toISOString().slice(0, 19)}+05:30`
      const sample: StreamSample = { t: iso, hr, simulated: true }
      onSample(sample)
    }, 2000)
    onStatus?.('open')
    return () => window.clearInterval(timer)
  },
}

function patientIdsIn(args: unknown[]): string[] {
  const ids: string[] = []
  for (const a of args) {
    if (typeof a === 'string' && /^P-\d{4}$/.test(a)) ids.push(a)
    else if (a && typeof a === 'object' && typeof (a as { patient_id?: unknown }).patient_id === 'string') ids.push((a as { patient_id: string }).patient_id)
  }
  return ids
}

// Every async method syncs from storage first and commits afterwards when something changed.
const SYNC_ONLY = new Set(['openStream', 'exportWellnessUrl', 'exportEhrUrl'])
export const mockClient: ApiClient = Object.fromEntries(
  Object.entries(rawClient).map(([key, fn]) => {
    if (typeof fn !== 'function' || SYNC_ONLY.has(key)) return [key, fn]
    const wrapped = async (...args: unknown[]) => {
      // Hosted demo: make sure every person this call touches has their record loaded.
      if (S) await Promise.all(patientIdsIn(args).map(loadDetail))
      sync()
      try {
        return await (fn as (...a: unknown[]) => Promise<unknown>)(...args)
      } finally {
        if (dirty) commit()
      }
    }
    return [key, wrapped]
  }),
) as unknown as ApiClient

// First load in this browser: seed. Otherwise pick up whatever the last session left.
sync()
function firstLoad(): boolean {
  try {
    const st = storage()
    return !st || st.getItem(REV_KEY) === null
  } catch {
    return true
  }
}
// The snapshot replays the real server, which starts with no escalation in progress.
if (firstLoad()) {
  if (!S) seedLiveEscalation()
  commit()
}

export type { AlertStatus }
