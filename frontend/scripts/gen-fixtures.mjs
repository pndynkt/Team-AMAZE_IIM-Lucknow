// Deterministic fixture generator for src/api/fixtures/*.json.
// Run: node scripts/gen-fixtures.mjs
// Every shape follows docs/API.md. Seeded so output is reproducible.

import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'src', 'api', 'fixtures')
mkdirSync(OUT, { recursive: true })

// mulberry32 seeded PRNG
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = rng(42)
const r = (lo, hi) => lo + (hi - lo) * rand()
const ri = (lo, hi) => Math.floor(r(lo, hi + 1))
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

const AS_OF = '2026-10-12'
const TZ = '+05:30'
const NOW_ISO = `${AS_OF}T07:27:00${TZ}`
const NOW = new Date(NOW_ISO)

function isoAt(date, hh, mm = 0) {
  return `${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${TZ}`
}
function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function minusMinutesIso(mins) {
  const d = new Date(NOW.getTime() - mins * 60000)
  // format in +05:30
  const local = new Date(d.getTime() + 5.5 * 3600000)
  return local.toISOString().replace('Z', TZ).replace(/\.\d{3}/, '')
}

const write = (name, obj, compact = false) => {
  writeFileSync(join(OUT, name), JSON.stringify(obj, null, compact ? 0 : 2) + '\n')
  console.log('wrote', name)
}

// ---------------------------------------------------------------- meta
const meta = {
  app: 'Pratibimb',
  version: '1.0.0',
  as_of: AS_OF,
  cohort_size: 240,
  days: 120,
  condition: 'Hypertension with cardiovascular risk',
  event_definition: 'Cardiovascular strain episode within the next 72 hours',
  model_version: 'fusion-lgbm-2026.10.12',
  demo_speed: 10,
}
write('meta.json', meta)

// ---------------------------------------------------------------- patients (triage)
const FIRST_F = ['Meera', 'Lakshmi', 'Priya', 'Anjali', 'Sunita', 'Kavita', 'Rekha', 'Deepa', 'Shalini', 'Pooja', 'Asha', 'Nandini', 'Geeta', 'Radha', 'Sarita', 'Vandana', 'Jyoti', 'Bhavna', 'Smita', 'Usha', 'Farida', 'Zeenat', 'Mariam', 'Gurpreet', 'Harleen', 'Ritu', 'Neha', 'Swati', 'Madhavi', 'Latha']
const FIRST_M = ['Rajesh', 'Suresh', 'Arun', 'Vikram', 'Sanjay', 'Mahesh', 'Ramesh', 'Anil', 'Prakash', 'Dinesh', 'Manoj', 'Ashok', 'Venkatesh', 'Girish', 'Harish', 'Naveen', 'Pradeep', 'Rakesh', 'Sunil', 'Vinod', 'Imran', 'Salim', 'Joseph', 'Thomas', 'Balbir', 'Jaswinder', 'Kiran', 'Rohit', 'Amit', 'Sudhir']
const LAST = ['Iyer', 'Sharma', 'Patel', 'Reddy', 'Nair', 'Gupta', 'Verma', 'Singh', 'Kulkarni', 'Mehta', 'Desai', 'Rao', 'Menon', 'Joshi', 'Chowdhury', 'Banerjee', 'Pillai', 'Das', 'Mukherjee', 'Khan', 'Sheikh', 'Fernandes', 'D’Souza', 'Kaur', 'Gill', 'Agarwal', 'Bose', 'Naidu', 'Shetty', 'Mishra', 'Yadav', 'Chauhan', 'Tiwari', 'Saxena', 'Bhatt']
const CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Jaipur', 'Lucknow', 'Kochi', 'Ahmedabad', 'Indore', 'Noida', 'Chandigarh', 'Bhopal', 'Coimbatore', 'Nagpur', 'Surat', 'Patna', 'Guwahati', 'Mysuru', 'Vadodara']
const DEVICES = [
  ['Noise', 'ColorFit Pro 5'],
  ['boAt', 'Wave Sigma 3'],
  ['Fire-Boltt', 'Ninja Call Pro'],
  ['Noise', 'Pulse 2 Max'],
  ['Amazfit', 'Bip 5'],
  ['Realme', 'Watch 3'],
  ['Samsung', 'Galaxy Watch 7'],
  ['Apple', 'Watch SE'],
  ['boAt', 'Lunar Discovery'],
  ['Fastrack', 'Reflex Vox'],
]
const EXTRA_CONDS = ['Type 2 diabetes', 'Dyslipidaemia', 'Obesity', 'CKD stage 2', 'Hypothyroidism', 'Atrial fibrillation', 'Obstructive sleep apnoea']

const REASONS = {
  urgent: [
    (d) => `Overnight HR +${d.rhrDelta} bpm vs your baseline for ${d.nights} nights`,
    (d) => `Home SBP rising ${d.slope} mmHg/day over 7 days; HRV below your usual`,
    (d) => `HRV below your smallest worthwhile change for ${d.nights} nights; SBP ${d.sbp} this morning`,
  ],
  watch: [
    (d) => `Overnight HR +${d.rhrDelta} bpm vs baseline, ${d.nights} nights`,
    (d) => `Sleep ${d.sleepLoss} below usual for ${d.nights} nights`,
    (d) => `Missed BP medication ${d.missed} of last 7 days`,
    (d) => `Steps ${d.stepsPct}% below your usual this week`,
    (d) => `Home SBP ${d.sbp}, above your 28-day mean for ${d.nights} mornings`,
  ],
  low: [
    () => 'Within your personal baseline',
    () => 'Stable: all signals near baseline',
    () => 'HRV slightly below mean, not sustained',
    () => 'Steps above usual this week',
    () => 'Sleep and HR within baseline band',
  ],
}

function spark(base, trend, noise, n = 7, dec = 0) {
  const out = []
  for (let i = 0; i < n; i++) {
    const v = base + trend * (i / (n - 1)) + (rand() - 0.5) * noise
    out.push(dec ? round(v, dec) : Math.round(v))
  }
  return out
}

function makePatient(i, tier, score, forced) {
  const id = `P-${String(i).padStart(4, '0')}`
  const sex = forced?.sex ?? (rand() < 0.48 ? 'F' : 'M')
  const name = forced?.name ?? `${pick(sex === 'F' ? FIRST_F : FIRST_M)} ${pick(LAST)}`
  const age = forced?.age ?? ri(42, 74)
  const city = forced?.city ?? pick(CITIES)
  const conds = forced?.conditions ?? ['Essential hypertension', ...(rand() < 0.65 ? [pick(EXTRA_CONDS)] : []), ...(rand() < 0.2 ? [pick(EXTRA_CONDS)] : [])]
  const uniqConds = [...new Set(conds)]
  const dev = forced?.device ?? pick(DEVICES)
  const rhrBase = forced ? 62 : ri(56, 72)
  const sbpBase = forced ? 134 : ri(122, 146)
  const hrvBase = forced ? 38 : ri(24, 48)
  const strength = tier === 'urgent' ? 1 : tier === 'watch' ? 0.5 : 0.08
  const rhrDelta = tier === 'urgent' ? ri(6, 11) : tier === 'watch' ? ri(3, 5) : ri(0, 2)
  const sparklines = forced?.sparklines ?? {
    rhr: spark(rhrBase, rhrDelta * (tier === 'low' ? r(-1, 1) : 1), 1.6),
    hrv: spark(hrvBase, -hrvBase * 0.28 * strength, 2.2),
    sbp: spark(sbpBase, 16 * strength, 3),
  }
  const freshRoll = rand()
  let freshness
  if (freshRoll < 0.82) {
    const m = ri(8, 88)
    freshness = { last_sample_at: minusMinutesIso(m), minutes_ago: m, label: 'fresh' }
  } else if (freshRoll < 0.95) {
    const m = ri(120, 1380)
    freshness = { last_sample_at: minusMinutesIso(m), minutes_ago: m, label: 'stale' }
  } else {
    const m = ri(1500, 6200)
    freshness = { last_sample_at: minusMinutesIso(m), minutes_ago: m, label: 'offline' }
  }
  if (forced?.freshness) freshness = forced.freshness
  const details = {
    rhrDelta,
    nights: ri(2, 4),
    slope: round(r(1.4, 2.8), 1),
    sbp: sparklines.sbp[6],
    sleepLoss: `${ri(1, 2)} h ${pick(['10', '20', '30', '40'])} m`,
    missed: ri(2, 4),
    stepsPct: ri(30, 55),
  }
  const top_reason = forced?.top_reason ?? pick(REASONS[tier])(details)
  const ns_state = forced?.ns_state ?? (tier === 'urgent' ? (rand() < 0.75 ? 'red' : 'yellow') : tier === 'watch' ? (rand() < 0.55 ? 'yellow' : 'green') : rand() < 0.04 ? 'yellow' : 'green')
  const delta = forced?.risk_delta_7d ?? (tier === 'urgent' ? ri(12, 30) : tier === 'watch' ? ri(-4, 18) : ri(-6, 6))
  return {
    id,
    name,
    age,
    sex,
    city,
    conditions: uniqConds,
    device: { brand: dev[0], model: dev[1], source: 'simulated', simulated: true },
    risk_score: score,
    tier,
    ns_state,
    risk_delta_7d: delta,
    top_reason,
    freshness,
    wear_time_pct_7d: forced?.wear_time_pct_7d ?? (freshness.label === 'offline' ? ri(20, 45) : ri(58, 98)),
    sparklines,
    open_alert_id: forced?.open_alert_id ?? null,
    escalation_status: null,
  }
}

const MEERA_FRESH = { last_sample_at: `${AS_OF}T06:40:00${TZ}`, minutes_ago: 47, label: 'fresh' }
const meeraRow = makePatient(7, 'urgent', 71, {
  name: 'Meera Iyer',
  age: 58,
  sex: 'F',
  city: 'Bengaluru',
  conditions: ['Essential hypertension', 'Type 2 diabetes'],
  device: ['Noise', 'ColorFit Pro 5'],
  risk_delta_7d: 23,
  top_reason: 'Overnight HR +9 bpm vs your baseline for 3 nights',
  freshness: MEERA_FRESH,
  wear_time_pct_7d: 86,
  sparklines: { rhr: [62, 63, 62, 64, 66, 69, 71], hrv: [38, 37, 36, 33, 31, 29, 28], sbp: [134, 136, 135, 139, 142, 147, 151] },
  ns_state: 'red',
  open_alert_id: 'AL-0231',
})

// Score plan: 9 urgent, 31 watch, 200 low across ids 1..240
const urgentScores = [68, 66, 65, 64, 63, 62, 61, 60]
const watchScores = Array.from({ length: 31 }, (_, k) => 59 - Math.floor((k * 29) / 31))
const lowScores = Array.from({ length: 200 }, () => ri(2, 29))
const plan = []
for (const s of urgentScores) plan.push(['urgent', s])
for (const s of watchScores) plan.push(['watch', s])
for (const s of lowScores) plan.push(['low', s])
// shuffle plan deterministically, then assign to ids except 7
for (let k = plan.length - 1; k > 0; k--) {
  const j = Math.floor(rand() * (k + 1))
  ;[plan[k], plan[j]] = [plan[j], plan[k]]
}
const patients = []
let pi = 0
for (let i = 1; i <= 240; i++) {
  if (i === 7) {
    patients.push(meeraRow)
    continue
  }
  const [tier, score] = plan[pi++]
  patients.push(makePatient(i, tier, score))
}
// open alerts for a handful of urgent/watch patients
const alertedIds = ['P-0019', 'P-0042', 'P-0088', 'P-0133', 'P-0151']
patients.forEach((p) => {
  if (alertedIds.includes(p.id) && p.tier !== 'low') p.open_alert_id = `AL-0${ri(200, 240)}`
})
patients.sort((a, b) => (b.risk_score ?? -1) - (a.risk_score ?? -1) || a.name.localeCompare(b.name))

const triage = {
  as_of: AS_OF,
  summary: { total: 240, urgent: 9, watch: 31, low: 200, open_alerts: 14, false_alert_rate_per_patient_day: 0.041 },
  patients,
}
write('patients.json', triage, true)

// ---------------------------------------------------------------- patient detail (Meera)
const meera = {
  id: 'P-0007',
  name: 'Meera Iyer',
  age: 58,
  sex: 'F',
  city: 'Bengaluru',
  state: 'Karnataka',
  abha_masked: '91-XXXX-XXXX-4821',
  consent: { ehr: true, wearable: true, ai_predictions: true, emergency_contacts: true, updated_at: '2026-09-02T10:15:00+05:30' },
  ehr: {
    conditions: [
      { code: '59621000', system: 'SNOMED', display: 'Essential hypertension', onset: '2019-03-01' },
      { code: '44054006', system: 'SNOMED', display: 'Type 2 diabetes mellitus', onset: '2021-07-14' },
      { code: '55822004', system: 'SNOMED', display: 'Hyperlipidaemia', onset: '2021-07-14' },
      { code: '414916001', system: 'SNOMED', display: 'Obesity (BMI 28 to 30)', onset: '2023-01-10' },
    ],
    medications: [
      { name: 'Amlodipine 5 mg', class: 'CCB', adherence_30d_pct: 72 },
      { name: 'Metformin 500 mg', class: 'Biguanide', adherence_30d_pct: 88 },
      { name: 'Atorvastatin 10 mg', class: 'Statin', adherence_30d_pct: 91 },
    ],
    labs: [
      { name: 'HbA1c', loinc: '4548-4', value: 7.1, unit: '%', date: '2026-08-20', flag: 'high' },
      { name: 'LDL cholesterol', loinc: '13457-7', value: 118, unit: 'mg/dL', date: '2026-08-20', flag: 'high' },
      { name: 'HDL cholesterol', loinc: '2085-9', value: 44, unit: 'mg/dL', date: '2026-08-20', flag: 'normal' },
      { name: 'Creatinine', loinc: '2160-0', value: 0.9, unit: 'mg/dL', date: '2026-08-20', flag: 'normal' },
      { name: 'eGFR', loinc: '62238-1', value: 78, unit: 'mL/min/1.73m2', date: '2026-08-20', flag: 'normal' },
      { name: 'Fasting glucose', loinc: '1558-6', value: 134, unit: 'mg/dL', date: '2026-08-20', flag: 'high' },
    ],
    vitals_clinic: { sbp: 148, dbp: 92, bmi: 28.4, date: '2026-08-20' },
    genetics: { polygenic_risk_tier: 'high', note: 'Simulated CAD polygenic risk tier (synthetic)' },
    family_history: ['Father: myocardial infarction at 61', 'Mother: type 2 diabetes'],
    smoker: false,
    diabetes: true,
    ckd: false,
    prior_mi: false,
  },
  static_risk: { framingham_10y_pct: 18.4, label: 'high', south_asian_note: 'Framingham under-estimates risk in South Asians; WHO SEAR chart planned.' },
  device: { brand: 'Noise', model: 'ColorFit Pro 5', source: 'simulated', simulated: true, sync_interval: 'hourly' },
  baselines: { rhr_28d_median: 62.0, lnrmssd_60d_mean: 3.61, lnrmssd_swc: 0.08, sbp_28d_mean: 136.2, nights_available: 112 },
  current: { risk_score: 71, tier: 'urgent', ns_state: 'red', probability_72h: 0.71, probability_band: [0.58, 0.8], as_of: AS_OF },
  emergency_contacts: [
    { id: 'C1', name: 'Arjun Iyer', relation: 'Son', phone_masked: '+91 98XXX XX412', channels: ['sms', 'whatsapp', 'voice'], consented_at: '2026-09-02T10:20:00+05:30' },
    { id: 'C2', name: 'Lakshmi Iyer', relation: 'Sister', phone_masked: '+91 99XXX XX087', channels: ['sms', 'voice'], consented_at: '2026-09-02T10:22:00+05:30' },
  ],
  clinician: { name: 'Dr Kavya Rao', role: 'Physician', sla_minutes: 60 },
}
write('patient-P-0007.json', meera)

// ---------------------------------------------------------------- timeline (120 days, slice 30)
function buildTimeline(days) {
  const start = addDays(AS_OF, -(days - 1))
  const rows = []
  const last7 = {
    rhr: [62, 63, 62, 64, 66, 69, 71],
    rmssd: [38, 37, 36, 33, 31, 29, 28],
    sbp: [134, 136, 135, 139, 142, 147, 151],
    dbp: [84, 85, 84, 87, 88, 91, 92],
    steps: [5900, 5200, 4700, 4300, 4100, 3900, 3800],
    sleep: [405, 392, 380, 360, 350, 345, 340],
    score: [47, 49, 50, 54, 59, 66, 71],
    ns: ['green', 'green', 'green', 'green', 'red', 'red', 'red'],
  }
  const scoreRamp = { '2026-09-26': 18, '2026-09-27': 20, '2026-09-28': 22, '2026-09-29': 24, '2026-09-30': 26, '2026-10-01': 30, '2026-10-02': 33, '2026-10-03': 38, '2026-10-04': 44, '2026-10-05': 48 }
  const local = rng(7)
  const lr = (lo, hi) => lo + (hi - lo) * local()
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i)
    const idx7 = i - (days - 7)
    const missing = date === '2026-09-22' || date === '2026-07-20' || date === '2026-07-21'
    if (missing) {
      rows.push({ date, rhr: null, lnrmssd: null, rmssd: null, sleep_min: null, sleep_eff: null, steps: null, resp_rate: null, spo2: null, sbp_home: null, dbp_home: null, ns_state: 'green', risk_score: null, tier: 'low', missing: true, events: [] })
      continue
    }
    let rhr, rmssd, sbp, dbp, steps, sleep, score, ns
    if (idx7 >= 0) {
      rhr = last7.rhr[idx7] + lr(-0.3, 0.3)
      rmssd = last7.rmssd[idx7] + lr(-0.4, 0.4)
      sbp = last7.sbp[idx7]
      dbp = last7.dbp[idx7]
      steps = last7.steps[idx7] + Math.round(lr(-150, 150))
      sleep = last7.sleep[idx7]
      score = last7.score[idx7]
      ns = last7.ns[idx7]
    } else {
      const blip = date === '2026-08-02' || date === '2026-08-03' || date === '2026-09-19'
      rhr = 62 + lr(-1.4, 1.4) + (blip ? 3.4 : 0)
      rmssd = 37 + lr(-2.6, 2.6)
      const preDrift = date >= '2026-09-28' ? (new Date(date) - new Date('2026-09-28')) / 86400000 : 0
      sbp = Math.round(133 + lr(-3, 3) + preDrift * 0.3)
      dbp = Math.round(83 + lr(-2, 2))
      steps = Math.round(6100 + lr(-900, 900) - preDrift * 120)
      sleep = Math.round(412 + lr(-25, 25) - preDrift * 6)
      score = scoreRamp[date] ?? Math.round(8 + lr(0, 9))
      ns = blip ? 'yellow' : 'green'
    }
    // home BP not every day outside the last week
    const bpTaken = idx7 >= 0 || local() < 0.68
    const tier = score >= 60 ? 'urgent' : score >= 30 ? 'watch' : 'low'
    const events = []
    if (date === '2026-10-03') events.push('missed_dose')
    rows.push({
      date,
      rhr: round(rhr, 1),
      lnrmssd: round(Math.log(rmssd), 2),
      rmssd: round(rmssd, 1),
      sleep_min: sleep,
      sleep_eff: round(clamp(0.88 + lr(-0.05, 0.04) - (idx7 >= 0 ? 0.04 : 0), 0.7, 0.95), 2),
      steps,
      resp_rate: round(14.2 + lr(-0.6, 0.6) + (idx7 >= 4 ? 0.9 : 0), 1),
      spo2: round(97.1 + lr(-0.5, 0.5), 1),
      sbp_home: bpTaken ? sbp : null,
      dbp_home: bpTaken ? dbp : null,
      ns_state: ns,
      risk_score: score,
      tier,
      missing: false,
      events,
    })
  }
  return {
    id: 'P-0007',
    days,
    rows,
    baseline_band: { rhr: [59.5, 64.5], lnrmssd: [3.53, 3.69], sbp: [130, 142] },
    annotations: [
      { date: '2026-09-19', kind: 'symptom', label: 'Headache in the evening', by: 'patient' },
      { date: '2026-10-03', kind: 'missed_dose', label: 'Missed amlodipine', by: 'patient' },
      { date: '2026-10-07', kind: 'meal', label: 'Wedding dinner, heavy and salty', by: 'patient' },
      { date: '2026-10-09', kind: 'note', label: 'Called patient, advised BP check', by: 'Dr Kavya Rao' },
      { date: '2026-10-11', kind: 'symptom', label: 'Felt dizzy after lunch', by: 'patient' },
    ].filter((a) => a.date >= addDays(AS_OF, -(days - 1))),
  }
}
const timeline120 = buildTimeline(120)
write('timeline-P-0007-120.json', timeline120, true)
const timeline30 = { ...timeline120, days: 30, rows: timeline120.rows.slice(-30), annotations: timeline120.annotations.filter((a) => a.date >= addDays(AS_OF, -29)) }
write('timeline-P-0007.json', timeline30)

// ---------------------------------------------------------------- intraday for as_of (partial day to 06:40)
function buildIntraday(date, overnightRhr, untilMinute, seed) {
  const local = rng(seed)
  const lr = (lo, hi) => lo + (hi - lo) * local()
  const samples = []
  for (let m = 0; m <= untilMinute; m += 5) {
    const h = m / 60
    let hr
    if (h < 7) hr = overnightRhr + Math.sin(h * 1.3) * 1.6 + lr(-1.8, 1.8)
    else if (h < 9) hr = overnightRhr + 10 + (h - 7) * 4 + lr(-3, 3)
    else if (h < 13) hr = overnightRhr + 16 + lr(-4, 4)
    else if (h < 17.5) hr = overnightRhr + 13 + lr(-4, 4)
    else if (h < 18.2) hr = overnightRhr + 38 + lr(-6, 6)
    else if (h < 22) hr = overnightRhr + 12 + lr(-3, 3)
    else hr = overnightRhr + 5 + lr(-2, 2)
    samples.push({ t: isoAt(date, Math.floor(m / 60), m % 60), hr: Math.round(hr) })
  }
  return { id: 'P-0007', date, interval_min: 5, source: 'simulated', simulated: true, samples, overnight_window: ['00:00', '07:00'], overnight_rhr: overnightRhr }
}
write('intraday-P-0007.json', buildIntraday(AS_OF, 71.2, 6 * 60 + 40, 1012))

// ---------------------------------------------------------------- forecast
const histRows = timeline30.rows.slice(-7)
const forecast = {
  id: 'P-0007',
  as_of: AS_OF,
  horizon_days: 3,
  history: histRows.map((rw) => ({ date: rw.date, rhr: rw.rhr, sbp: rw.sbp_home })),
  rhr: [
    { date: '2026-10-13', p10: 69.2, p50: 72.4, p90: 75.9 },
    { date: '2026-10-14', p10: 69.8, p50: 73.6, p90: 78.0 },
    { date: '2026-10-15', p10: 69.4, p50: 74.1, p90: 79.9 },
  ],
  sbp: [
    { date: '2026-10-13', p10: 146, p50: 153, p90: 161 },
    { date: '2026-10-14', p10: 147, p50: 155, p90: 164 },
    { date: '2026-10-15', p10: 147, p50: 156, p90: 167 },
  ],
  episode_probability: [
    { date: '2026-10-13', p: 0.42, band: [0.31, 0.52] },
    { date: '2026-10-14', p: 0.55, band: [0.43, 0.66] },
    { date: '2026-10-15', p: 0.61, band: [0.48, 0.72] },
  ],
  probability_72h: 0.71,
  band_72h: [0.58, 0.8],
  twin_accuracy_7d: { rhr_mae: 1.8, sbp_mae: 4.3, coverage_p10_p90: 0.86, label: 'good' },
  confidence: 'high',
}
write('forecast-P-0007.json', forecast)

// ---------------------------------------------------------------- explain
write('explain-P-0007.json', {
  id: 'P-0007',
  as_of: AS_OF,
  probability_72h: 0.71,
  base_rate: 0.06,
  contributors: [
    { feature: 'rhr_dev_3d', label: 'Overnight HR +9 bpm vs 28-day baseline (3-night mean)', value: 9.1, shap: 0.21, direction: 'up', group: 'wearable' },
    { feature: 'sbp_slope_7d', label: 'Home SBP rising 2.4 mmHg/day over 7 days', value: 2.4, shap: 0.14, direction: 'up', group: 'wearable' },
    { feature: 'hrv_below_swc', label: 'HRV below your smallest worthwhile change for 4 nights', value: 1, shap: 0.09, direction: 'up', group: 'wearable' },
    { feature: 'framingham_10y', label: '10-year Framingham risk 18.4% (high)', value: 18.4, shap: 0.05, direction: 'up', group: 'ehr' },
    { feature: 'steps_z', label: 'Steps 38% below your usual', value: -1.2, shap: 0.04, direction: 'up', group: 'wearable' },
    { feature: 'med_adherence_30d', label: 'Amlodipine adherence 72% over 30 days', value: 72, shap: 0.03, direction: 'up', group: 'ehr' },
  ],
  protective: [
    { feature: 'on_statin', label: 'On statin', value: 1, shap: -0.02, direction: 'down', group: 'ehr' },
    { feature: 'non_smoker', label: 'Non-smoker', value: 1, shap: -0.01, direction: 'down', group: 'ehr' },
  ],
  rule_state: { ns_state: 'red', rule: 'Overnight RHR ≥ +4 bpm above 28-day median for 2 consecutive nights', days_in_state: 3 },
  model_version: 'fusion-lgbm-2026.10.12',
  inputs_used: ['28 nights of HR', '26 nights of HRV', '19 home BP readings', 'EHR: 4 conditions, 3 medications, 6 labs'],
  stale_inputs: [],
})

// ---------------------------------------------------------------- alerts
const alerts = {
  budget: { target_false_alerts_per_patient_day: 0.07, observed_validation: 0.041, cohort_alerts_last_7d: 23, cohort_patient_days_last_7d: 1680, observed_rate: 0.0137, status: 'within_budget' },
  alerts: [
    { id: 'AL-0231', patient_id: 'P-0007', patient_name: 'Meera Iyer', created_at: `${AS_OF}T06:52:00${TZ}`, tier: 'urgent', kind: 'model', title: 'Strain episode risk 71% in next 72 h', reason: 'Overnight HR +9 bpm vs baseline for 3 nights; home SBP rising', status: 'open', confidence: 'high', snoozed_until: null, acknowledged_by: null, escalation_id: null, owner: 'Dr Kavya Rao' },
    { id: 'AL-0230', patient_id: 'P-0019', patient_name: patients.find((p) => p.id === 'P-0019').name, created_at: `${AS_OF}T06:31:00${TZ}`, tier: 'urgent', kind: 'acute', title: 'Live HR above 140 bpm for 10 minutes', reason: 'Streamed HR 142 to 151 bpm from 06:15 to 06:25 while at rest', status: 'escalated', confidence: 'high', snoozed_until: null, acknowledged_by: 'Dr Kavya Rao', escalation_id: 'ES-0011', owner: 'Dr Kavya Rao' },
    { id: 'AL-0229', patient_id: 'P-0042', patient_name: patients.find((p) => p.id === 'P-0042').name, created_at: `${AS_OF}T05:58:00${TZ}`, tier: 'watch', kind: 'rule', title: 'NightSignal red: overnight HR elevated 2 nights', reason: 'Overnight RHR +5 bpm above 28-day median for 2 consecutive nights', status: 'acknowledged', confidence: 'medium', snoozed_until: null, acknowledged_by: 'Dr Kavya Rao', escalation_id: null, owner: 'Dr Kavya Rao' },
    { id: 'AL-0228', patient_id: 'P-0088', patient_name: patients.find((p) => p.id === 'P-0088').name, created_at: '2026-10-11T21:14:00+05:30', tier: 'watch', kind: 'caregiver', title: 'Caregiver check-in: feeling tired', reason: 'Daughter reported unusual tiredness and poor appetite for two days', status: 'snoozed', confidence: 'medium', snoozed_until: `${AS_OF}T09:00:00${TZ}`, acknowledged_by: 'Dr Kavya Rao', escalation_id: null, owner: 'Dr Kavya Rao' },
    { id: 'AL-0226', patient_id: 'P-0133', patient_name: patients.find((p) => p.id === 'P-0133').name, created_at: '2026-10-11T14:02:00+05:30', tier: 'urgent', kind: 'sos', title: 'SOS pressed by patient', reason: 'Patient held SOS; no response to the 60 s check-in', status: 'resolved', confidence: 'high', snoozed_until: null, acknowledged_by: 'Dr Kavya Rao', escalation_id: 'ES-0009', owner: 'Dr Kavya Rao', outcome: 'false_alarm' },
    { id: 'AL-0224', patient_id: 'P-0151', patient_name: patients.find((p) => p.id === 'P-0151').name, created_at: '2026-10-10T07:20:00+05:30', tier: 'watch', kind: 'model', title: 'Strain episode risk 38% in next 72 h', reason: 'Sleep 1 h 20 m below usual for 4 nights; HRV trending down', status: 'resolved', confidence: 'low', snoozed_until: null, acknowledged_by: 'Dr Kavya Rao', escalation_id: null, owner: 'Dr Kavya Rao', outcome: 'handled' },
  ],
}
write('alerts.json', alerts)

// ---------------------------------------------------------------- thresholds
write('thresholds.json', { watch: 30, urgent: 60, ns_rhr_delta_yellow: 3.0, ns_rhr_delta_red: 4.0, ns_consecutive_nights: 2, hrv_swc_multiplier: 0.5, min_confidence_for_urgent: 'medium' })

// ---------------------------------------------------------------- model card
write('model.json', {
  name: 'Pratibimb fusion model',
  version: 'fusion-lgbm-2026.10.12',
  task: 'Binary: cardiovascular strain episode onset within 72 h',
  data: {
    cohort: 240,
    patient_days: 28800,
    events: 312,
    event_rate: 0.0108,
    split: 'patient-level 70/15/15',
    synthetic: true,
    generator_seed: 42,
    sources: ['Synthetic EHR (Synthea-shaped FHIR R4)', 'Synthetic wearable streams parameterised from published baselines'],
  },
  metrics: {
    fused: { auroc: 0.91, auprc: 0.42, sensitivity: 0.81, specificity: 0.95, false_alerts_per_patient_day: 0.041, median_lead_hours: 52, brier: 0.031 },
    wearable_only: { auroc: 0.84, auprc: 0.31, sensitivity: 0.74, specificity: 0.91, false_alerts_per_patient_day: 0.078, median_lead_hours: 44, brier: 0.038 },
    ehr_only: { auroc: 0.68, auprc: 0.12, sensitivity: 0.52, specificity: 0.86, false_alerts_per_patient_day: 0.113, brier: 0.047 },
    rule_only: { auroc: 0.77, auprc: 0.19, sensitivity: 0.73, specificity: 0.88, false_alerts_per_patient_day: 0.094, median_lead_hours: 36 },
  },
  ablation_note: 'Wearable-only model confuses infection-like episodes with strain; fusion with home BP trend and EHR removes 41 of 97 false alerts in validation.',
  forecast: { rhr_mae_day1: 1.6, sbp_mae_day1: 4.1, coverage_p10_p90: 0.84 },
  calibration: {
    bins: [
      { p_mean: 0.02, obs: 0.018, n: 15200 },
      { p_mean: 0.06, obs: 0.055, n: 6100 },
      { p_mean: 0.12, obs: 0.13, n: 2800 },
      { p_mean: 0.2, obs: 0.19, n: 1400 },
      { p_mean: 0.3, obs: 0.33, n: 760 },
      { p_mean: 0.42, obs: 0.4, n: 420 },
      { p_mean: 0.55, obs: 0.58, n: 210 },
      { p_mean: 0.72, obs: 0.69, n: 90 },
    ],
  },
  features: [
    { name: 'rhr_dev_3d', group: 'wearable', importance: 0.21, label: 'Overnight RHR deviation, 3-night mean' },
    { name: 'sbp_slope_7d', group: 'wearable', importance: 0.14, label: 'Home SBP slope, 7 days' },
    { name: 'hrv_below_swc', group: 'wearable', importance: 0.09, label: 'Nights with HRV below SWC' },
    { name: 'sleep_debt_3d', group: 'wearable', importance: 0.07, label: 'Sleep debt, 3 nights' },
    { name: 'steps_z', group: 'wearable', importance: 0.06, label: 'Steps z-score vs 28 days' },
    { name: 'framingham_10y', group: 'ehr', importance: 0.05, label: '10-year Framingham risk' },
    { name: 'med_adherence_30d', group: 'ehr', importance: 0.05, label: 'BP medication adherence, 30 days' },
    { name: 'hba1c', group: 'ehr', importance: 0.04, label: 'Latest HbA1c' },
    { name: 'resp_rate_dev', group: 'wearable', importance: 0.03, label: 'Respiratory rate deviation' },
    { name: 'spo2_min', group: 'wearable', importance: 0.02, label: 'Overnight SpO2 minimum' },
    { name: 'polygenic_tier', group: 'ehr', importance: 0.02, label: 'Polygenic risk tier' },
    { name: 'age', group: 'ehr', importance: 0.02, label: 'Age' },
  ],
  limitations: [
    'Trained and validated on synthetic data only; real-world performance is unknown.',
    'Consumer wearables under-sample and mis-estimate HR during motion; overnight windows are used to limit this.',
    'Home BP readings are patient-entered and may be missing for days at a time.',
    'Framingham under-estimates risk in South Asians; the WHO SEAR chart is planned.',
    'The model may not detect every event, and some alerts will be false; the alert budget is set to limit this.',
    'Minimum 14 nights of data needed before urgent alerts are enabled for a person.',
  ],
  published_anchors: [
    { name: 'NightSignal (infection)', sensitivity: 0.8, specificity: 0.877, lead: 'median 3 days' },
    { name: 'Epic Deterioration Index', auroc: 0.76, lead: 'median 28 h' },
    { name: 'Fitbit COVID-19 study', auroc: 0.72, lead: 'median 2 days' },
  ],
  regulatory: {
    status: 'Research proof-of-concept, not a medical device',
    cdsco: 'Production version would be Medical Device Software, likely Class B or C (CDSCO MDSW guidance, 30 Jul 2026)',
    dpdp: 'DPDP-ready ahead of 13 May 2027 commencement',
  },
  leakage_tests: { passed: true, tests: ['no_future_values_in_features', 'patient_level_split', 'label_window_excludes_t'] },
})

// ---------------------------------------------------------------- audit log
const auditActions = [
  ['system', 'system', 'score.updated', (p) => `score=${p.risk_score} tier=${p.tier} model=${meta.model_version}`, 'ai_predictions', null],
  ['system', 'system', 'ingest.accepted', () => `accepted=${ri(4, 24)} rejected=0 source=simulated`, 'wearable', null],
  ['Dr Kavya Rao', 'clinician', 'patient.viewed', () => 'Opened twin view', 'ehr', null],
  ['Dr Kavya Rao', 'clinician', 'alert.acknowledged', () => 'Called patient, advised BP check', 'ai_predictions', null],
  ['patient', 'patient', 'checkin.answered', () => `answer=${pick(['Fine', 'Tired', 'Fine', 'Dizzy'])}`, 'wearable', null],
  ['patient', 'patient', 'annotation.added', () => `kind=${pick(['symptom', 'meal', 'missed_dose'])}`, 'wearable', null],
  ['system', 'system', 'export.wellnessrecord', () => 'FHIR R4 Bundle, 9 observations', 'ehr', null],
]
const auditEntries = []
let aid = 1900
const auditTimes = []
for (let i = 0; i < 42; i++) auditTimes.push(ri(30, 5 * 24 * 60))
auditTimes.sort((a, b) => a - b)
for (let i = 0; i < 42; i++) {
  const p = pick(patients.slice(0, 60))
  const [actor, actor_type, action, detailFn, consent_basis, channel] = pick(auditActions)
  auditEntries.push({ id: aid--, at: minusMinutesIso(auditTimes[i]), actor, actor_type, patient_id: p.id, action, object: action.startsWith('alert') ? p.open_alert_id ?? 'AL-0219' : null, detail: detailFn(p), consent_basis, channel })
}
// pinned recent events for Meera at the top
auditEntries.unshift(
  { id: 1821, at: `${AS_OF}T06:52:00${TZ}`, actor: 'system', actor_type: 'system', patient_id: 'P-0007', action: 'alert.created', object: 'AL-0231', detail: `tier=urgent score=71 model=${meta.model_version}`, consent_basis: 'ai_predictions', channel: null },
  { id: 1820, at: `${AS_OF}T06:51:00${TZ}`, actor: 'system', actor_type: 'system', patient_id: 'P-0007', action: 'score.updated', object: null, detail: `score=71 tier=urgent prob72h=0.71 band=[0.58,0.80] model=${meta.model_version}`, consent_basis: 'ai_predictions', channel: null },
  { id: 1819, at: `${AS_OF}T06:41:00${TZ}`, actor: 'system', actor_type: 'system', patient_id: 'P-0007', action: 'ingest.accepted', object: null, detail: 'accepted=14 rejected=0 source=simulated device=Noise ColorFit Pro 5', consent_basis: 'wearable', channel: null },
  { id: 1818, at: `${AS_OF}T06:41:00${TZ}`, actor: 'system', actor_type: 'system', patient_id: 'P-0007', action: 'notification.sent', object: 'AL-0231', detail: 'Clinician push to Dr Kavya Rao', consent_basis: 'ai_predictions', channel: 'push' },
  { id: 1817, at: '2026-10-11T13:40:00+05:30', actor: 'patient', actor_type: 'patient', patient_id: 'P-0007', action: 'annotation.added', object: null, detail: 'kind=symptom label="Felt dizzy after lunch"', consent_basis: 'wearable', channel: null },
  { id: 1816, at: '2026-10-09T11:05:00+05:30', actor: 'Dr Kavya Rao', actor_type: 'clinician', patient_id: 'P-0007', action: 'annotation.added', object: null, detail: 'kind=note label="Called patient, advised BP check"', consent_basis: 'ehr', channel: null },
  { id: 1815, at: '2026-10-09T11:02:00+05:30', actor: 'Dr Kavya Rao', actor_type: 'clinician', patient_id: 'P-0007', action: 'patient.viewed', object: null, detail: 'Opened twin view', consent_basis: 'ehr', channel: null },
  { id: 1814, at: '2026-10-03T21:30:00+05:30', actor: 'patient', actor_type: 'patient', patient_id: 'P-0007', action: 'annotation.added', object: null, detail: 'kind=missed_dose label="Missed amlodipine"', consent_basis: 'wearable', channel: null },
  { id: 1813, at: '2026-09-02T10:15:00+05:30', actor: 'patient', actor_type: 'patient', patient_id: 'P-0007', action: 'consent.updated', object: null, detail: 'ehr=true wearable=true ai_predictions=true emergency_contacts=true', consent_basis: 'consent', channel: null },
)
auditEntries.sort((a, b) => (a.at < b.at ? 1 : -1))
write('audit.json', { entries: auditEntries })

// ---------------------------------------------------------------- patient view (me)
write('me-P-0007.json', {
  id: 'P-0007',
  first_name: 'Meera',
  score: { value: 71, label: 'Needs attention', ring_color: 'urgent', state: 'ready', nights_needed: 7, nights_available: 112 },
  drivers: [
    { label: 'Resting heart rate', value: '71 bpm', vs_baseline: '+9', arrow: 'up', good: false },
    { label: 'Sleep', value: '5 h 40 m', vs_baseline: '-1 h 10 m', arrow: 'down', good: false },
    { label: 'Steps', value: '3,800', vs_baseline: '-38%', arrow: 'down', good: false },
  ],
  sentence: {
    en: 'Your heart has been working harder than usual for three nights and your morning BP is rising. Please check your BP this evening and rest.',
    hi: 'पिछली तीन रातों से आपका दिल सामान्य से ज़्यादा मेहनत कर रहा है और सुबह का BP बढ़ रहा है। कृपया आज शाम BP जाँचें और आराम करें।',
  },
  checkin: {
    pending: true,
    question: { en: 'How do you feel today?', hi: 'आज आप कैसा महसूस कर रहे हैं?' },
    options: ['Fine', 'Tired', 'Dizzy', 'Chest discomfort'],
  },
  freshness: MEERA_FRESH,
  device: { brand: 'Noise', simulated: true },
  contacts: [
    { name: 'Arjun', relation: 'Son' },
    { name: 'Lakshmi', relation: 'Sister' },
  ],
  doctor: { name: 'Dr Kavya Rao', reviewed_at: `${AS_OF}T05:30:00${TZ}` },
  share_card: { title: "Meera's day", lines: ['Heart: working harder (+9 bpm)', 'Sleep: 5 h 40 m', 'BP: 151/92 this morning'], footer: 'Reviewed by Dr Kavya Rao · Pratibimb' },
})

// ---------------------------------------------------------------- escalation (contact_1)
write('escalation.json', {
  id: 'ES-0012',
  patient_id: 'P-0007',
  patient_name: 'Meera Iyer',
  trigger: 'sos',
  started_at: `${AS_OF}T07:25:40${TZ}`,
  state: 'contact_1',
  countdown_ends_at: `${AS_OF}T07:26:40${TZ}`,
  steps: [
    { n: 1, state: 'user_prompt', at: `${AS_OF}T07:25:40${TZ}`, detail: "Full-screen alert, sound + vibration, 60 s to tap I'm OK", status: 'no_response' },
    {
      n: 2,
      state: 'contact_1',
      at: `${AS_OF}T07:26:40${TZ}`,
      detail: 'Arjun Iyer: push + SMS (-S template) + WhatsApp utility + voice call from 1600-series number',
      status: 'sent',
      messages: [
        { channel: 'sms', to: '+91 98XXX XX412', template_id: 'PRATIBIMB-S-001', header: 'PRTBMB-S', body: 'Pratibimb: Meera Iyer has not responded to a health check-in. Last location: https://maps.app/x/7h2k, Call her or tap to call 112. Reply STOP to opt out.', mock: true },
        { channel: 'whatsapp', template: 'emergency_checkin_v1', to: '+91 98XXX XX412', mock: true },
        { channel: 'voice', from: '1600-XXX-XXXX', script: 'This is Pratibimb. Meera has not responded to a health check-in. Press 1 if you can reach her. Press 2 to call 112 on her behalf.', mock: true },
      ],
    },
    { n: 3, state: 'contact_2', at: `${AS_OF}T07:28:40${TZ}`, detail: 'Lakshmi Iyer: SMS (-S template) + voice call', status: 'pending' },
    { n: 4, state: 'doctor', at: `${AS_OF}T07:30:40${TZ}`, detail: 'Dr Kavya Rao alerted, 60-minute SLA', status: 'pending' },
  ],
  location: { lat: 12.97, lng: 77.59, accuracy_m: 25 },
  actions: { call_112_url: 'tel:112', uhi_ambulance_url: 'https://uhi.example/ambulance?ref=ES-0012', mock: true },
  resolved_by: null,
  outcome: null,
})

console.log('done')
