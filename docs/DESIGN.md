# Pratibimb design system

Pratibimb (प्रतिबिम्ब, "reflection") is a digital twin for Indian adults with hypertension and cardiovascular risk. Three surfaces: a landing page, a clinician console, a patient view, plus an evaluator guide. The finish target: calm, precise, generous whitespace, one memorable element per page, nothing decorative that does not carry information.

## Concept: two streams, one reflection

The product fuses two streams into one twin. The palette tells that story.

- **Peacock** is the live stream: the watch, the cuff, everything that flows in every night. Cool, clear, calm.
- **Sandalwood** is the record stream: the health record, labs, medicines, family history. Warm, archival, trusted.
- **The twin** is where they meet. The brand mark shows a peacock pulse and a sandalwood record line merging into one ring that is reflected in still water.
- **Lotus** is the heart. It marks heart-rate signals and the patient's own space, and it brings warmth and positivity.
- **Morning mist** is the ground: a cool, very light green-grey that is easy on the eyes for long clinic sessions. The patient view warms it toward dawn.

Indian vernacular grounds the names (peacock, sandalwood, lotus, turmeric, sindoor) so the identity is specific to this brief and not a generic health-tech blue.

## Tokens

Light theme (default). Store as RGB triplets in `src/index.css` and expose through Tailwind, plus literal hex variables for charts.

| Token | Hex | Use |
|---|---|---|
| `mist` | `#F1F6F5` | page background (console, landing) |
| `surface` | `#FFFFFF` | panels |
| `surface-2` | `#F7FAF9` | inset areas, table header row, input fill |
| `mist-deep` | `#DDE8E6` | baseline bands, skeletons, dividers that need weight |
| `line` | `rgba(16, 48, 47, 0.09)` | hairlines |
| `ink` | `#10302F` | primary text (deep tide green, not near-black) |
| `ink-2` | `#46605E` | secondary text |
| `ink-3` | `#5A7371` | captions, axis labels (4.5:1 on white and on mist) |
| `peacock` | `#0B7F86` | links, focus ring, active nav, forecast line, live-stream identity |
| `peacock-deep` | `#086A70` | primary button fill (white text 6.3:1), pressed states |
| `peacock-soft` | `#DCEFEF` | selected rows, soft fills |
| `sandalwood` | `#A8703C` | record-stream identity (fills, chart series) |
| `sandalwood-text` | `#8A5A2B` | sandalwood text on white |
| `sandalwood-soft` | `#F5EADF` | record chips, record panel tint |
| `lotus` | `#D9668E` | heart-rate identity, patient warmth |
| `lotus-text` | `#B23F69` | lotus text on white |
| `lotus-soft` | `#FBE6EE` | patient hero glow, heart chips |
| `dawn` | `#FFF3EA` | top of the patient view gradient |
| `dawn-glow` | `#F6C7A6` | logo glow, sunrise accents (decorative only) |

Clinical tiers. Always icon plus text, never colour alone. The tier colours are reserved for status; brand colours never mean status.

| Tier | Fill (chips, tints) | Text / stroke | Icon | Name |
|---|---|---|---|---|
| Steady (`low`) | `#E3F4EB` | `#187A4C` | check in circle | leaf |
| Check in (`watch`) | `#FDF1D6` | `#946100` | eye | turmeric |
| Needs attention (`urgent`) | `#FCE6E1` | `#B03A23` | alert triangle | sindoor |
| Predictions off / unknown | `#E9EEED` | `#5E7775` | minus in circle | |

Patient-facing tier words are warm and plain: "Steady", "Worth a check-in", "Needs attention". Clinician words: "Low", "Watch", "Urgent".

Metric identity colours (glyphs, legends, small labels only; lines in the main charts stay ink):

| Signal | Hex |
|---|---|
| Resting heart rate | lotus `#D9668E` |
| HRV | monsoon `#4C7FD0` |
| Blood pressure | peacock `#0B7F86` (the condition the twin is built for) |
| Sleep | dusk `#5B6CC9` |
| Steps | moss `#4E8A31` |
| SpO2 | sky `#2E8FBF` |
| Respiratory rate | aqua `#24978C` |
| Health record | sandalwood `#A8703C` |

Dark theme (console setting): background `#0E1A1A`, surface `#152424`, surface-2 `#1B2C2C`, ink `#E8F1EF`, ink-2 `#A9BDBA`, ink-3 `#7F9794`, peacock `#3FC1C0`, sandalwood `#D6A06A`, lotus `#F08DB0`, tiers text `#4CC38A` / `#E6B44A` / `#F07A5E`, tier fills at 16% alpha.

## Type

- **Figtree** (variable, self-hosted with `@fontsource-variable/figtree`) for everything: display, UI, numbers. Humanist geometric, warm, very legible, has tabular figures. Use `font-feature-settings: "tnum"` on every number in a table, stat, axis or score.
- **Mukta** (self-hosted with `@fontsource/mukta`) for Devanagari.
- No monospace anywhere (identifiers like P-0007 and ABHA use Figtree tabular figures).
- No Inter, no SF fallback as the primary.

Scale (rem at 16 px): display 4.0 / 1.05, weight 650, tracking -0.035em; h1 2.5 / 1.1, 650, -0.03em; h2 1.75 / 1.2, 620, -0.02em; h3 1.25 / 1.3, 600, -0.01em; body 1.0 / 1.55 (console body 0.9375 / 1.5); small 0.8125 / 1.4; caption 0.75 / 1.35. Line length under 72 characters for prose.

Rules: sentence case everywhere. No uppercase tracked labels, no eyebrow above every heading, no single highlighted word inside a headline, no middle-dot meta strings (lay out meta as separate items with gaps or use commas), no arrow glyph appended to buttons or links.

## Layout and surfaces

- Radius hierarchy carries meaning: page panels 22 px, nested blocks 14 px, controls 12 px, chips full. Never one radius for everything.
- Two shadows only: `rest` = `0 1px 1px rgba(16,48,47,.04), 0 8px 28px -16px rgba(16,48,47,.16)`; `lift` (sheets, popovers, drawers) = `0 24px 60px -24px rgba(16,48,47,.30)`.
- Not everything is a card. Use lists with hairline dividers for rows, open sections on the mist background for narrative, and one strong panel per screen for the main object.
- Console: left rail 232 px, content max 1360 px, 32 px gutters. Landing: max 1120 px, left-aligned hero text. Patient: mobile-first column max 440 px, centred on desktop in a soft device frame.

## Brand

- `src/brand/` owns the logo mark, wordmark, app icon, favicon and the vital glyph set. Pages import from `@/brand`.
- Mark: two streams (peacock pulse, sandalwood record) converge into a ring above a waterline; below, the ring is reflected with a slow ripple. Animated version for the landing hero and loading states; static, simplified version at 16 to 32 px for the rail, favicon and tab.
- Vital glyphs replace generic icons for domain concepts: heart rate, HRV, blood pressure, sleep, steps, SpO2, respiration, health record, genetics, medicine, the twin, consent, the check-in ladder, live stream. Each glyph is a crafted SVG with an optional motion that shows what the signal does (the heart beats, the cuff needle settles, the lungs expand). Generic UI chrome (chevrons, search, close, menu) can stay lucide.
- No decorative effects: no gradients behind data, no glass effects, no emoji.

## Motion

- One orchestrated moment per page. Landing: the mark assembles (streams draw in, ring closes, reflection ripples) and the forecast fan opens. Patient twin page: the score counts up once and the forecast fan opens. Patient view: the ring fills once.
- Motion that answers an action is welcome: tabs, drawers, the SOS hold ring, the countdown, the ladder steps.
- No fade-and-rise on every section, no hover lift on every card.
- `prefers-reduced-motion` turns every loop off and shows final states.

## Clarity rules for the two audiences

Doctor (console):
- Every screen answers "who needs me, why, and what do I do" in that order.
- Triage leads with one sentence ("9 people need attention today, 31 are worth a check-in") and a priority list. Each row: person, the reason in plain clinical words, risk and tier, one trend, data freshness. Advanced columns go behind a "More columns" toggle.
- The twin page opens with a twin summary paragraph (what the twin expects, why, the strongest lever, the suggested next step), then the two streams side by side (record and live), then the forecast.
- Charts always show the person's own normal range as a band and label it "her usual range".

Patient (mobile):
- One status in words first, then the number. Three things that changed, each compared to "your usual". One plain sentence in English or Hindi. "What helps you" lists the levers that work for this person, from the personal physiology engine, framed positively. Then check-in, log, SOS, contacts, doctor.

## Case-brief priorities (keep them visible)

1. Fusion of two streams: label "Health record" (sandalwood) and "Wearable" (peacock) wherever the twin uses them.
2. A working model that predicts an adverse event ahead of time: always show the horizon ("next 72 hours"), the probability with its band, and the lead.
3. How a doctor interacts with the virtual patient: acknowledge, annotate, simulate, adjust thresholds, escalate.
4. The twin simulates this person's physiology and personalises the plan: personal response slopes with intervals, "strongest lever", what-if using personal slopes.
5. India context and data rules: cheap-watch freshness chips, Hindi, synthetic data labels, compliance.

## Copy

Never say "heart attack", "diagnose", "detects", "revolutionary", "seamless", "unlock". Say "strain episode", "needs attention", "check in", "may not detect every event". Numbers carry units and a comparison to the person's own usual.
