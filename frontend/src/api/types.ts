// TypeScript types for every response shape in docs/API.md (contract v1 plus the v1.1 additions).
// Keep these in lock-step with the backend; the fixtures are validated against them.

export type Tier = 'low' | 'watch' | 'urgent'
export type TierOrOptedOut = Tier | 'opted_out'
export type NsState = 'green' | 'yellow' | 'red'
export type FreshnessLabel = 'fresh' | 'stale' | 'offline'
export type Source = 'simulated' | 'health_connect' | 'oura' | 'whoop' | 'apple_hae' | 'csv'
export type Confidence = 'high' | 'medium' | 'low'

export interface Freshness {
  last_sample_at: string
  minutes_ago: number
  label: FreshnessLabel
}

export interface Device {
  brand: string
  model: string
  source: Source
  simulated: boolean
  sync_interval?: string
}

export interface ApiError {
  detail: string
}

// GET /api/meta
export interface Meta {
  app: string
  version: string
  as_of: string
  cohort_size: number
  days: number
  condition: string
  event_definition: string
  model_version: string
  demo_speed: number
}

// GET /api/patients
export interface TriageSummary {
  total: number
  urgent: number
  watch: number
  low: number
  opted_out?: number
  open_alerts: number
  false_alert_rate_per_patient_day: number
  active_escalations?: number
}

/** Seven daily values, oldest first. Null where the device was not worn or no reading was taken. */
export interface Sparklines {
  rhr: (number | null)[]
  hrv: (number | null)[]
  sbp: (number | null)[]
}

export type EscalationState =
  | 'user_prompt'
  | 'contact_1'
  | 'contact_2'
  | 'doctor'
  | 'resolved'
  | 'cancelled'

export interface TriagePatient {
  id: string
  name: string
  age: number
  sex: 'F' | 'M' | 'O'
  city: string
  conditions: string[]
  device: Device
  risk_score: number | null
  tier: TierOrOptedOut
  ns_state: NsState
  risk_delta_7d: number
  top_reason: string
  freshness: Freshness
  wear_time_pct_7d: number
  sparklines: Sparklines
  open_alert_id: string | null
  escalation_status: EscalationState | null
  confidence?: Confidence
}

export interface TriageResponse {
  as_of: string
  patients: TriagePatient[]
  summary: TriageSummary
}

export interface TriageQuery {
  tier?: Tier
  sort?: 'risk_score' | 'freshness' | 'name'
  q?: string
}

// GET /api/patients/{id}
export interface Consent {
  ehr: boolean
  wearable: boolean
  ai_predictions: boolean
  emergency_contacts: boolean
  updated_at: string
}

export interface ConsentUpdate {
  ehr?: boolean
  wearable?: boolean
  ai_predictions?: boolean
  emergency_contacts?: boolean
  withdraw?: boolean
}

export interface EhrCondition {
  code: string
  system: string
  display: string
  onset: string
}

export interface EhrMedication {
  name: string
  class: string
  adherence_30d_pct: number
}

export interface EhrLab {
  name: string
  loinc: string
  value: number
  unit: string
  date: string
  flag: 'high' | 'low' | 'normal' | null
}

export interface EhrVitalsClinic {
  sbp: number
  dbp: number
  bmi: number
  date: string
}

export interface EhrGenetics {
  polygenic_risk_tier: 'low' | 'intermediate' | 'high'
  note: string
}

export interface Ehr {
  conditions: EhrCondition[]
  medications: EhrMedication[]
  labs: EhrLab[]
  vitals_clinic: EhrVitalsClinic
  genetics: EhrGenetics
  family_history: string[]
  smoker: boolean
  diabetes: boolean
  ckd: boolean
  prior_mi: boolean
}

export interface StaticRisk {
  framingham_10y_pct: number
  label: 'low' | 'intermediate' | 'high'
  south_asian_note: string
}

export interface Baselines {
  rhr_28d_median: number
  lnrmssd_60d_mean: number
  lnrmssd_swc: number
  sbp_28d_mean: number
  nights_available: number
}

export interface CurrentRisk {
  risk_score: number | null
  tier: TierOrOptedOut
  ns_state: NsState
  probability_72h: number
  probability_band: [number, number]
  as_of: string
  confidence?: Confidence
}

export type Channel = 'sms' | 'whatsapp' | 'voice' | 'push'

export interface EmergencyContact {
  id: string
  name: string
  relation: string
  phone_masked: string
  channels: Channel[]
  consented_at: string
}

export interface Clinician {
  name: string
  role: string
  sla_minutes: number
}

export interface Patient {
  id: string
  name: string
  age: number
  sex: 'F' | 'M' | 'O'
  city: string
  state: string
  abha_masked: string
  consent: Consent
  ehr: Ehr
  static_risk: StaticRisk
  device: Device
  baselines: Baselines
  current: CurrentRisk
  emergency_contacts: EmergencyContact[]
  clinician: Clinician
  /** Present on newer backends; the triage row carries it otherwise. */
  freshness?: Freshness
}

// GET /api/patients/{id}/timeline
export type AnnotationKind = 'symptom' | 'meal' | 'missed_dose' | 'note'

export interface TimelineRow {
  date: string
  rhr: number | null
  lnrmssd: number | null
  rmssd: number | null
  sleep_min: number | null
  sleep_eff: number | null
  steps: number | null
  resp_rate: number | null
  spo2: number | null
  sbp_home: number | null
  dbp_home: number | null
  ns_state: NsState
  risk_score: number | null
  tier: TierOrOptedOut
  missing: boolean
  events: string[]
}

export interface Annotation {
  date: string
  kind: AnnotationKind
  label: string
  by: string
  id?: number
  at?: string
}

export interface TimelineLabel {
  date: string
  kind: string
  label: string
  visible_to_clinician: boolean
}

export interface Timeline {
  id: string
  days: number
  rows: TimelineRow[]
  baseline_band: {
    rhr: [number, number]
    lnrmssd: [number, number]
    sbp: [number, number]
  }
  annotations: Annotation[]
  labels?: TimelineLabel[]
}

// GET /api/patients/{id}/intraday
export interface IntradaySample {
  t: string
  hr: number
}

export interface Intraday {
  id: string
  date: string
  interval_min: number
  source: Source
  simulated: boolean
  samples: IntradaySample[]
  overnight_window: [string, string]
  overnight_rhr: number
}

// GET /api/patients/{id}/forecast
export interface QuantilePoint {
  date: string
  p10: number
  p50: number
  p90: number
}

export interface EpisodeProbabilityPoint {
  date: string
  p: number
  band: [number, number]
}

export interface TwinAccuracy {
  rhr_mae: number
  sbp_mae: number
  coverage_p10_p90: number
  label: 'good' | 'fair' | 'poor'
  n?: number
}

export interface Forecast {
  id: string
  as_of: string
  horizon_days: number
  history: { date: string; rhr: number | null; sbp: number | null }[]
  rhr: QuantilePoint[]
  sbp: QuantilePoint[]
  episode_probability: EpisodeProbabilityPoint[]
  probability_72h: number
  band_72h: [number, number]
  twin_accuracy_7d: TwinAccuracy
  confidence: Confidence
}

// GET /api/patients/{id}/explain
export type FeatureGroup = 'wearable' | 'ehr'

export interface Contributor {
  feature: string
  label: string
  value: number
  shap: number
  direction: 'up' | 'down'
  group: FeatureGroup
}

export interface Explain {
  id: string
  as_of: string
  probability_72h: number
  base_rate: number
  contributors: Contributor[]
  protective: Contributor[]
  rule_state: { ns_state: NsState; rule: string; days_in_state: number }
  model_version: string
  inputs_used: string[]
  stale_inputs: string[]
}

// POST /api/patients/{id}/simulate
export interface SimulateBody {
  walk_minutes_per_day?: number
  sleep_extra_hours?: number
  bp_med_adherence_pct?: number
  sodium_reduction?: boolean
  alcohol_free?: boolean
}

export interface SimulateOutcome {
  probability_72h: number
  band: [number, number]
  sbp_p50_day3: number
  rhr_p50_day3: number
}

/** Day-3 change versus no change (v1.1). */
export interface LeverEffect {
  rhr?: number | null
  sbp?: number | null
  /** Change in next-night HRV, in percent. */
  hrv_pct?: number | null
}

/**
 * v1.1: the same change on an ordinary week. The 72 h probability moves only through causes, so for a
 * person whose episode is already under way it can stay flat; this readout shows what the change does
 * to a normal week's risk.
 */
export interface UsualWeek {
  baseline: number
  scenario: number
  relative_change: number
  plain: string
}

export interface LeverApplied {
  lever: keyof SimulateBody
  value: number | boolean
  effect: string
  /** v1.1: false when this lever has no personal slope and uses the cohort average. */
  personalised?: boolean
  /** v1.1: this person's response from the personal physiology engine. */
  personal_effect?: LeverEffect
  /** v1.1: the cohort-average response for the same lever. */
  cohort_effect?: LeverEffect
}

export interface SimulateResponse {
  baseline: SimulateOutcome
  scenario: SimulateOutcome
  delta: { probability_72h: number; sbp_p50_day3: number; rhr_p50_day3: number }
  levers_applied: LeverApplied[]
  rhr: QuantilePoint[]
  sbp: QuantilePoint[]
  note: string
  /** v1.1: true when lever effects use this person's own response slopes. */
  personalised?: boolean
  best_lever?: BestLever
  /** v1.1: null when no lever is applied or the server cannot estimate it. */
  usual_week?: UsualWeek | null
}

/** v1.1: the strongest lever, with its expected effect. */
export interface BestLever {
  key: string
  lever: LeverName
  plain: string
  effect?: Record<string, number>
  scores?: Record<string, number>
}

// GET /api/patients/{id}/physiology (v1.1)
export type Evidence = 'strong' | 'moderate' | 'weak'
export type LeverName = 'sleep' | 'walking' | 'medication' | 'sodium' | 'alcohol' | string

export interface PhysiologyResponse {
  key: string
  lever: LeverName
  lever_label: string
  outcome: 'rhr' | 'sbp' | 'hrv' | string
  outcome_label: string
  /** "extra hour of sleep", "extra 1,000 steps" */
  per: string
  unit: string
  personal: number
  interval: [number, number]
  cohort: number
  relative_to_cohort: number
  evidence: Evidence
  plain: string
  /** The per-person fit before pooling. */
  raw?: number
  n_days?: number
}

export interface Physiology {
  id: string
  method: string
  calm_days_used: number
  days_available: number
  responses: PhysiologyResponse[]
  best_lever: BestLever | null
  validation: { true: Record<string, number> } | null
}

// GET /api/patients/{id}/summary (v1.1)
export interface TwinSummary {
  id: string
  headline: string
  tier: TierOrOptedOut
  sentences: string[]
  next_step: string
  streams: { record: string[]; wearable: string[] }
  usual_probability: number
  probability_72h?: number
  best_lever?: BestLever
}

// GET /api/alerts
export type AlertStatus = 'open' | 'acknowledged' | 'snoozed' | 'escalated' | 'resolved'
export type AlertKind = 'model' | 'rule' | 'sos' | 'fall' | 'caregiver' | 'acute'
export type AlertOutcome = 'false_alarm' | 'true_event' | 'handled'

export interface AlertBudget {
  target_false_alerts_per_patient_day: number
  observed_validation: number
  cohort_alerts_last_7d: number
  cohort_false_alerts_last_7d?: number
  cohort_patient_days_last_7d: number
  observed_rate: number
  observed_total_alert_rate?: number
  status: 'within_budget' | 'over_budget'
}

export interface Alert {
  id: string
  patient_id: string
  patient_name: string
  created_at: string
  tier: Tier
  kind: AlertKind
  title: string
  reason: string
  status: AlertStatus
  confidence: Confidence
  snoozed_until: string | null
  acknowledged_by: string | null
  escalation_id: string | null
  owner: string
  outcome?: AlertOutcome | null
  model_version?: string
}

export interface AlertsResponse {
  budget: AlertBudget
  alerts: Alert[]
}

export type AlertsQuery = { status?: AlertStatus | 'all'; patient_id?: string }

export interface AlertMutationResponse extends Alert {
  audit: AuditEntry[]
}

export interface AlertEscalateResponse extends Escalation {
  audit?: AuditEntry[]
}

// GET /api/thresholds
export interface Thresholds {
  watch: number
  urgent: number
  ns_rhr_delta_yellow: number
  ns_rhr_delta_red: number
  ns_consecutive_nights: number
  hrv_swc_multiplier: number
  min_confidence_for_urgent: Confidence
}

export type ThresholdsDraft = Partial<Thresholds> & { patient_id?: string }

export interface ThresholdPreviewSide {
  alerts: number
  per_patient_day: number
  would_have_caught_events: number
  events: number
}

export interface ThresholdPreview {
  window_days: number
  scope: 'cohort' | 'patient'
  current: ThresholdPreviewSide
  draft: ThresholdPreviewSide
  delta_alerts_pct: number
  sensitivity_change: number
}

// Escalation
export type EscalationTrigger = 'sos' | 'fall' | 'caregiver' | 'acute' | 'clinician'
export type StepStatus = 'no_response' | 'sent' | 'pending' | 'acknowledged' | 'responded' | 'skipped' | 'done'

export interface EscalationLocation {
  lat: number
  lng: number
  accuracy_m: number
}

export interface SmsMessage {
  channel: 'sms'
  to: string
  template_id: string
  header: string
  body: string
  mock: boolean
}

export interface WhatsappMessage {
  channel: 'whatsapp'
  template: string
  to?: string
  mock: boolean
}

export interface VoiceMessage {
  channel: 'voice'
  from: string
  script: string
  mock: boolean
}

export interface PushMessage {
  channel: 'push'
  title?: string
  body?: string
  mock: boolean
}

export type EscalationMessage = SmsMessage | WhatsappMessage | VoiceMessage | PushMessage

export interface EscalationStep {
  n: number
  state: Exclude<EscalationState, 'resolved' | 'cancelled'>
  at: string
  detail: string
  status: StepStatus
  messages?: EscalationMessage[]
}

export interface Escalation {
  id: string
  patient_id: string
  patient_name: string
  trigger: EscalationTrigger
  started_at: string
  state: EscalationState
  countdown_ends_at: string
  steps: EscalationStep[]
  location: EscalationLocation | null
  actions: { call_112_url: string; uhi_ambulance_url: string; mock: boolean }
  resolved_by: string | null
  outcome: AlertOutcome | 'im_ok' | null
}

export interface EscalationCreateBody {
  patient_id: string
  trigger: EscalationTrigger
  by: string
  alert_id: string | null
  location?: EscalationLocation | null
}

export type EscalationRespondAction =
  | 'im_ok'
  | 'acknowledged'
  | 'reached_patient'
  | 'resolved'
  | 'false_alarm'

export interface EscalationRespondBody {
  by: string
  action: EscalationRespondAction
  note?: string
}

export interface EscalationsResponse {
  escalations: Escalation[]
}

// GET /api/audit
export type ActorType = 'system' | 'clinician' | 'patient' | 'contact'

export interface AuditEntry {
  id: number
  at: string
  actor: string
  actor_type: ActorType
  patient_id: string | null
  action: string
  object: string | null
  detail: string
  consent_basis: string | null
  channel: string | null
}

export interface AuditResponse {
  entries: AuditEntry[]
}

// GET /api/me/{id}
export interface MeScore {
  value: number | null
  label: string
  ring_color: Tier | 'opted_out'
  state: 'ready' | 'calibrating'
  nights_needed: number
  nights_available: number
}

export interface MeDriver {
  label: string
  value: string
  vs_baseline: string
  arrow: 'up' | 'down' | 'flat'
  good: boolean
}

export interface Bilingual {
  en: string
  hi: string
}

/** v1.1: a lever that works for this person, strongest first, framed positively. */
export interface WhatHelps {
  lever: LeverName
  en: string
  hi: string
  /** "general" marks advice that helps most people rather than a personal finding. */
  strength: Evidence | 'general'
}

export interface MeView {
  id: string
  first_name: string
  score: MeScore
  drivers: MeDriver[]
  sentence: Bilingual
  checkin: { pending: boolean; question: Bilingual; options: string[] }
  freshness: Freshness
  device: { brand: string; simulated: boolean }
  contacts: { name: string; relation: string }[]
  doctor: { name: string; reviewed_at: string }
  share_card: { title: string; lines: string[]; footer: string }
  consent?: Consent
  what_helps?: WhatHelps[]
}

export interface CheckinBody {
  answer: string
  note?: string
}

export interface CheckinResponse {
  ok: boolean
  alert_created: boolean
  alert_id: string | null
}

export interface AnnotateBody {
  date: string
  kind: AnnotationKind
  label: string
  by?: string
}

export interface OkResponse {
  ok: boolean
}

// GET /api/model
export interface ModelMetrics {
  name?: string
  events?: number
  events_caught?: number
  auroc?: number
  auprc?: number
  sensitivity?: number
  sensitivity_48h_lead?: number
  specificity?: number
  false_alerts_per_patient_day?: number
  median_lead_hours?: number | null
  brier?: number | null
}

export interface CalibrationBin {
  p_mean: number
  obs: number
  n: number
}

export interface ModelFeature {
  name: string
  group: FeatureGroup
  importance: number
  label?: string
}

export interface PublishedAnchor {
  name: string
  auroc?: number
  sensitivity?: number
  specificity?: number
  lead?: string
  note?: string
  auroc_gain?: string
}

/** One value over repeated patient splits. */
export interface RepeatedValue {
  mean: number
  min?: number
  max?: number
}

/**
 * Repeated-split metrics. Accepted shapes: { fused: { auroc: { mean, min, max } } } or
 * { fused: { mean: { auroc }, min: { auroc }, max: { auroc } } }, plus optional split counts.
 */
export type RepeatedMetrics = Record<string, unknown> & { n_splits?: number; splits?: number | unknown[] }

// GET /api/model, physiology section (v1.1)
export interface ModelPhysiologyPair {
  key: string
  label: string
  unit?: string
  true_mean?: number
  true_sd?: number
  cohort_mean_estimate?: number
  tau?: number
  r_pooled: number
  r_raw: number
  mae_pooled: number
  mae_raw: number
  mae_population: number
  coverage_80: number
  n_patients: number
}

export interface ModelPhysiology {
  method: string
  pairs: ModelPhysiologyPair[]
  note: string
}

export interface ModelCard {
  name: string
  version: string
  task: string
  algorithm?: string
  condition?: string
  data: {
    cohort: number
    patient_days: number
    events: number
    event_rate: number
    split: string
    synthetic: boolean
    generator_seed: number
    sources: string[]
  }
  metrics: {
    fused: ModelMetrics
    wearable_only: ModelMetrics
    watch_only?: ModelMetrics
    ehr_only: ModelMetrics
    rule_only: ModelMetrics
    /** The fused model without the personal physiology adjustment. */
    fused_no_twin?: ModelMetrics
    ceiling_wearable_plus_oracle_prior?: ModelMetrics | null
    /** Mean, min and max over repeated patient splits, when the server publishes them. */
    repeated?: RepeatedMetrics
  }
  ablation_note: string
  /** What the personal physiology adjustment adds to the fused model. */
  twin_note?: string
  ceiling_note?: string
  forecast: { rhr_mae_day1: number; sbp_mae_day1: number; coverage_p10_p90: number }
  calibration: { bins: CalibrationBin[] }
  features: ModelFeature[]
  limitations: string[]
  published_anchors: PublishedAnchor[]
  regulatory: { status: string; cdsco: string; dpdp: string }
  leakage_tests: { passed: boolean; tests: string[] }
  physiology?: ModelPhysiology
}

// GET /api/health
export interface Health {
  ok: boolean
  model_loaded: boolean
  cohort_loaded: boolean
  warm?: boolean
}

// SSE /api/stream/{id}
export interface StreamSample {
  t: string
  hr: number
  simulated: boolean
}

export type StreamScenario = 'acute_tachycardia' | 'bradycardia' | 'normal'
