// Pratibimb brand geometry. One source of truth for the mark, the app icon and the favicon.
//
// The mark lives in a 120 x 120 box. The two streams run along the waterline (y = 70):
// the peacock live pulse enters from the left, the sandalwood record ledger from the right.
// Where they meet, the ring (the twin) rises and rests on the water; below the waterline
// the whole scene is mirrored, compressed and broken into drifting bands like still water.

export const VB = 120
export const CX = 60
export const H = 70 // waterline
export const R = 24
export const CY = H - R // 46

/** Left half of the ring, drawn from the meeting point up the left side to the top. */
export const RING_LEFT = `M${CX} ${H}A${R} ${R} 0 0 1 ${CX} ${H - 2 * R}`
/** Right half of the ring, drawn from the meeting point up the right side to the top. */
export const RING_RIGHT = `M${CX} ${H}A${R} ${R} 0 0 0 ${CX} ${H - 2 * R}`
/** Full ring continuing from the end of the pulse, used by the travelling highlight. */
export const RING_LOOP = `A${R} ${R} 0 0 1 ${CX} ${H - 2 * R}A${R} ${R} 0 0 1 ${CX} ${H}`

/** Live pulse at full detail: baseline, P wave, QRS, T wave, then into the meeting point. */
export const PULSE_LG =
  'M6 70H14.6C16.2 70 16.9 67.3 18.4 67.3S20.6 70 22.2 70H26.2L27.5 71.6L30 59.6L32.6 73.4L34 70' +
  'H36.6C38.4 70 39.4 67.5 41.2 67.5S44 70 45.8 70H60'
/** Live pulse at medium detail: the small waves drop out, the beat stays. */
export const PULSE_MD = 'M9 70H26.2L27.5 71.6L30 59.6L32.6 73.4L34 70H60'
/** The lotus heartbeat peak: the top of the R wave. */
export const LOTUS_TIP = 'M28.67 66L30 59.6L31.2 66'
export const LOTUS_TIP_Y = { from: 66.4, to: 62.6 }

/** Ledger segments of the record stream: even length, even spacing, fading outward. */
export const LEDGER_LG = [
  { x: 66, o: 1 },
  { x: 75.6, o: 0.8 },
  { x: 85.2, o: 0.6 },
  { x: 94.8, o: 0.42 },
  { x: 104.4, o: 0.26 },
]
export const LEDGER_MD = LEDGER_LG.slice(0, 4).map((s, i) => ({ ...s, o: [1, 0.74, 0.5, 0.3][i] }))
export const LEDGER_LEN = 5

/** Horizontal bands of the reflection, as [top, bottom] offsets below the waterline. */
export const BANDS_LG: [number, number][] = [
  [0.7, 6],
  [6.9, 11.4],
  [12.3, 15.6],
  [16.6, 19],
  [20.1, 21.9],
  [23.2, 24.5],
  [26, 27],
]
export const BANDS_MD: [number, number][] = [
  [0.8, 7.2],
  [8.4, 13],
  [14.4, 17.6],
  [19.2, 21.4],
]
/** Vertical compression of the reflection (water foreshortens what it mirrors). */
export const REFLECT_K = 0.8
export const REFLECT_DEPTH = 30

// Small mark: a separate drawing for 32 px and below. Ring plus pulse peak, heavier strokes.
export const SM = {
  vb: 32,
  cx: 16.6,
  h: 23,
  r: 8,
  ring: 2.5,
  stream: 2.1,
  // the beat sits clear of the ring so it never merges with the stroke at rail size
  pulse: 'M1 23H2.8L3.7 24.1L5.1 17.6L6.6 25.3L7.4 23H16.6',
  lotus: 'M4.32 21.2L5.1 17.6L5.8 21.2',
  lotusY: { from: 20.6, to: 18.6 },
  ledger: [
    { d: 'M27.2 23h1.6', o: 1 },
    { d: 'M30.8 23h0.01', o: 0.5 },
  ],
  /** right edge of the last ledger dot including its cap */
  end: 31.85,
  /** right edge of the ring stroke, for lockup spacing when the ledger is off */
  ringEnd: 16.6 + 8 + 1.25,
}

/**
 * Medium sizes (33 to 119 px) crop the 120 box to 92 x 92 so the ring reads larger;
 * the outer ends of the streams are faded there anyway.
 */
export const MD_CROP = { x: 14, y: 10, yNoReflection: 1, size: 92 }
/** right end of the medium ledger, in the 120 box */
export const MD_LEDGER_END = 99.8 + 1.2

/**
 * Superellipse tile outline (|x|^n + |y|^n = 1), the continuous corner of a good app icon.
 * n = 5 sits close to the familiar phone icon shape; a plain rounded rect has a visible kink
 * where the straight edge meets the arc, this does not.
 */
export function squirclePath(size = 100, n = 5, steps = 160): string {
  const half = size / 2
  const pts: string[] = []
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = half + half * Math.sign(c) * Math.pow(Math.abs(c), 2 / n)
    const y = half + half * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
}

export const SQUIRCLE_100 = squirclePath(100)
