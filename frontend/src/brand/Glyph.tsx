// Pratibimb vital glyphs: one family, 24 x 24, 1.75 stroke, round caps and joins.
// Each glyph can move to show what its signal does. Static by default, legible at 16 px.
import type { CSSProperties, ReactNode } from 'react'
import { useBrandId } from './Mark'
import './brand.css'

export const GLYPH_NAMES = [
  'heart', 'hrv', 'bp', 'sleep', 'steps', 'spo2', 'resp', 'record', 'genetics', 'medicine', 'twin', 'consent', 'ladder', 'live', 'doctor', 'family',
] as const
export type GlyphName = (typeof GLYPH_NAMES)[number]

export interface GlyphProps {
  name: GlyphName
  size?: number
  /** run the glyph's motion (heart beats, needle settles, lungs breathe) */
  animated?: boolean
  /** paint with the signal's identity colour instead of currentColor */
  tone?: 'identity' | 'current'
  className?: string
  title?: string
  /** colour scheme for the identity tone: follow the page, or force one */
  theme?: 'auto' | 'light' | 'dark'
}

/** Plain-language label and what each glyph's motion means. Handy for legends and tooltips. */
export const GLYPH_META: Record<GlyphName, { label: string; motion: string }> = {
  heart: { label: 'Heart rate', motion: 'Lub-dub, then rest. The trace sweeps with each beat.' },
  hrv: { label: 'HRV', motion: 'The gaps between beats keep shifting, as a healthy rhythm does.' },
  bp: { label: 'Blood pressure', motion: 'The cuff needle rises, then settles in the target zone.' },
  sleep: { label: 'Sleep', motion: 'The moon tilts slowly while two stars twinkle out of step.' },
  steps: { label: 'Steps', motion: 'Two footprints take turns, like a walk.' },
  spo2: { label: 'SpO2', motion: 'The wave in the drop drifts and the ring fills to 97%.' },
  resp: { label: 'Respiration', motion: 'The lungs fill and empty at 15 breaths a minute.' },
  record: { label: 'Health record', motion: 'Lines write in one by one, a record being kept.' },
  genetics: { label: 'Genetics', motion: 'The rungs shift so the helix seems to turn.' },
  medicine: { label: 'Medicine', motion: 'The capsule opens a little and closes again.' },
  twin: { label: 'Twin', motion: 'The mark in small: the ring breathes and the water answers.' },
  consent: { label: 'Consent', motion: 'The check draws in: permission given.' },
  ladder: { label: 'Check-in ladder', motion: 'Signals reach out to one contact after another.' },
  live: { label: 'Live stream', motion: 'Waves pulse out from a live source.' },
  doctor: { label: 'Doctor', motion: 'The stethoscope tube sways gently.' },
  family: { label: 'Family', motion: 'The heart between two people glows: emergency contacts.' },
}

/** accent strokes and fills: a lighter tint of the same colour */
const A = 0.45
type Vars = CSSProperties & Record<`--${string}`, string | number>
const v = (i: number) => ({ '--i': i }) as Vars

type Draw = (uid: string) => ReactNode

const DRAW: Record<GlyphName, Draw> = {
  heart: () => (
    <g className="pbg-heart-beat">
      <path d="M12 19.6C9.2 17.9 3.9 14.3 3.9 9.4C3.9 6.9 5.8 5 8.2 5C9.8 5 11.1 5.8 12 7.1C12.9 5.8 14.2 5 15.8 5C18.2 5 20.1 6.9 20.1 9.4C20.1 14.3 14.8 17.9 12 19.6Z" />
      <path className="pbg-heart-trace" d="M7.2 11.6H9.4L10.5 9.6L12.1 14L13.3 10.8L14.1 11.6H16.8" pathLength={1} strokeOpacity={A} strokeWidth={1.5} />
    </g>
  ),

  hrv: () => (
    <>
      <path d="M2.8 15.4H21.2" strokeOpacity={A} />
      <path className="pbg-hrv-1" d="M5.1 15.4L6.7 6.2L8.5 18.1L9.4 15.4" />
      <path className="pbg-hrv-2" d="M10.5 15.4L12.1 7L13.9 18.1L14.8 15.4" />
      <path className="pbg-hrv-3" d="M15.8 15.4L17.4 6.6L19.2 18.1L20.1 15.4" />
    </>
  ),

  bp: () => (
    <>
      <path d="M5.59 17.3A7.4 7.4 0 1 1 18.41 17.3" />
      <path d="M7.3 13.6H6.6M8.68 10.28L8.18 9.78M12 9.1V8.4" strokeOpacity={A} />
      <path className="pbg-zone" d="M14.02 9.47A4.6 4.6 0 0 1 16.32 12.03" strokeOpacity={A} strokeWidth={2.1} />
      <path className="pbg-needle" d="M12 13.6V8.2" />
      <circle cx={12} cy={13.6} r={1.55} fill="currentColor" stroke="none" />
      <path d="M9.4 20.4H14.6" strokeOpacity={A} />
    </>
  ),

  sleep: () => (
    <>
      <path className="pbg-moon" d="M8.33 5.67A7.8 7.8 0 1 0 18.33 10.33A7.2 7.2 0 0 1 8.33 5.67Z" />
      <path className="pbg-star-1" d="M18.4 3.2V5.8M17.1 4.5H19.7" strokeWidth={1.5} />
      <circle className="pbg-star-2" cx={21} cy={8.1} r={0.95} fill="currentColor" stroke="none" fillOpacity={0.8} />
    </>
  ),

  steps: () => {
    const print = (
      <>
        <path d="M0 -4.2C1.7 -4.2 2.6 -2.4 2.5 0C2.4 2 1.7 3.2 0 3.2C-1.7 3.2 -2.5 2 -2.5 0C-2.5 -2.4 -1.6 -4.2 0 -4.2Z" />
        <path d="M-1.9 5.9H1.9V6.6A1.9 1.9 0 0 1 -1.9 6.6Z" />
      </>
    )
    return (
      <>
        <g transform="translate(8.2 12.1) rotate(-7)">
          <g className="pbg-foot-a">{print}</g>
        </g>
        <g transform="translate(15.9 7.6) rotate(7)">
          <g className="pbg-foot-b">{print}</g>
        </g>
      </>
    )
  },

  spo2: (uid) => {
    const drop = 'M10.4 3.6C10.4 3.6 4.4 9.9 4.4 14.2A6 6 0 0 0 16.4 14.2C16.4 9.9 10.4 3.6 10.4 3.6Z'
    return (
      <>
        <defs>
          <clipPath id={`${uid}-d`}>
            <path d={drop} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${uid}-d)`}>
          <path
            className="pbg-wave"
            d="M-1 14.4c1 0 1.5-1 2.5-1s1.5 1 2.5 1 1.5-1 2.5-1 1.5 1 2.5 1 1.5-1 2.5-1 1.5 1 2.5 1 1.5-1 2.5-1 1.5 1 2.5 1 1.5-1 2.5-1 1.5 1 2.5 1"
            strokeOpacity={A}
            strokeWidth={1.5}
          />
        </g>
        <path d={drop} />
        <circle cx={18.7} cy={6.1} r={2.5} strokeOpacity={0.22} strokeWidth={1.5} />
        <circle
          className="pbg-o2"
          cx={18.7}
          cy={6.1}
          r={2.5}
          pathLength={100}
          strokeDasharray="97 103"
          strokeWidth={1.5}
          transform="rotate(-90 18.7 6.1)"
        />
      </>
    )
  },

  resp: () => (
    <>
      <path d="M12 3.6V9.6" />
      <path d="M12 9.6L10.2 11.6M12 9.6L13.8 11.6" strokeOpacity={A} />
      <path className="pbg-lobe-l" d="M9.6 7.4C7.6 7.6 4.7 10.9 4.3 15.6C4.1 18.3 5.1 20.2 7.3 20.2C9 20.2 9.9 19.1 9.9 17.3V7.7C9.9 7.5 9.8 7.4 9.6 7.4Z" />
      <path className="pbg-lobe-r" d="M14.4 7.4C16.4 7.6 19.3 10.9 19.7 15.6C19.9 18.3 18.9 20.2 16.7 20.2C15 20.2 14.1 19.1 14.1 17.3V7.7C14.1 7.5 14.2 7.4 14.4 7.4Z" />
    </>
  ),

  record: () => (
    <>
      <path d="M14.2 3.5H7.6A2.1 2.1 0 0 0 5.5 5.6V18.4A2.1 2.1 0 0 0 7.6 20.5H16.4A2.1 2.1 0 0 0 18.5 18.4V7.8Z" />
      <path d="M14.2 3.5V6.4A1.4 1.4 0 0 0 15.6 7.8H18.5" />
      <path className="pbg-line" style={v(0)} d="M8.8 11.6H15.2" pathLength={1} strokeOpacity={0.62} />
      <path className="pbg-line" style={v(1)} d="M8.8 14.6H15.2" pathLength={1} strokeOpacity={0.62} />
      <path className="pbg-line" style={v(2)} d="M8.8 17.6H12.4" pathLength={1} strokeOpacity={0.62} />
    </>
  ),

  genetics: () => (
    <>
      <path d="M8.5 3.5C8.5 8 15.5 8 15.5 12S8.5 16 8.5 20.5" />
      <path d="M15.5 3.5C15.5 8 8.5 8 8.5 12S15.5 16 15.5 20.5" />
      <path className="pbg-rung" style={v(0)} d="M10.3 5.73H13.7" strokeOpacity={A} />
      <path className="pbg-rung" style={v(1)} d="M10.3 10.01H13.7" strokeOpacity={A} />
      <path className="pbg-rung" style={v(2)} d="M10.3 13.99H13.7" strokeOpacity={A} />
      <path className="pbg-rung" style={v(3)} d="M10.3 18.27H13.7" strokeOpacity={A} />
    </>
  ),

  medicine: () => (
    <g transform="rotate(-45 12 12)">
      <path className="pbg-cap-r" d="M12 8.2H15.8A3.8 3.8 0 0 1 15.8 15.8H12Z" fill="currentColor" fillOpacity={0.2} />
      <path className="pbg-cap-l" d="M12 8.2H8.2A3.8 3.8 0 0 0 8.2 15.8H12Z" />
      <path className="pbg-cap-l" d="M7.4 10.6Q8 10.1 8.9 10.1" strokeOpacity={A} strokeWidth={1.3} />
    </g>
  ),

  twin: () => (
    <>
      <circle className="pbg-twin-ring" cx={12} cy={9.8} r={5.2} />
      <path className="pbg-twin-refl" d="M7.11 17.74A5.2 4.16 0 0 1 16.89 17.74" strokeOpacity={0.3} />
      <ellipse className="pbg-twin-ripple" cx={12} cy={16.6} rx={8} ry={1.4} strokeWidth={1} strokeOpacity={0.5} />
      <path d="M2.2 15H2.9L3.6 15.9L4.6 11.6L5.6 16.6L6.1 15H12" />
      <path d="M15.6 15H17.4" />
      <path d="M19.8 15H21.2" strokeOpacity={A} />
    </>
  ),

  consent: () => (
    <>
      <path d="M12 3.4L18.6 5.8V11.2C18.6 15.3 15.9 18.7 12 20.5C8.1 18.7 5.4 15.3 5.4 11.2V5.8Z" fill="currentColor" fillOpacity={0.08} />
      <path className="pbg-check" d="M8.9 12.1L11.1 14.3L15.2 10.1" pathLength={1} />
    </>
  ),

  ladder: () => (
    <>
      <rect x={3.6} y={5.4} width={8} height={13.2} rx={2.1} />
      <path d="M6.7 15.9H8.5" strokeOpacity={A} />
      <path className="pbg-arc" style={v(0)} d="M13.86 9.74A3.2 3.2 0 0 1 13.86 14.26" />
      <path className="pbg-arc" style={v(1)} d="M15.84 7.76A6 6 0 0 1 15.84 16.24" strokeOpacity={0.72} />
      <path className="pbg-arc" style={v(2)} d="M17.82 5.78A8.8 8.8 0 0 1 17.82 18.22" strokeOpacity={A} />
    </>
  ),

  live: () => (
    <>
      <circle className="pbg-live-ring" style={v(1)} cx={12} cy={12} r={9} strokeOpacity={A} />
      <circle className="pbg-live-ring" style={v(0)} cx={12} cy={12} r={5.6} />
      <circle className="pbg-live-dot" cx={12} cy={12} r={2.1} fill="currentColor" stroke="none" />
    </>
  ),

  doctor: () => (
    <>
      <path d="M5 4.4V9.2A4.2 4.2 0 0 0 13.4 9.2V4.4" />
      <path d="M5 4.4H6.2M13.4 4.4H12.2" />
      <g className="pbg-tube">
        <path d="M9.2 13.4V15.8A3.8 3.8 0 0 0 16.8 15.8V14" />
        <circle cx={16.8} cy={11.8} r={2.2} />
        <circle cx={16.8} cy={11.8} r={0.75} fill="currentColor" fillOpacity={A} stroke="none" />
      </g>
    </>
  ),

  family: () => (
    <>
      <circle cx={7.6} cy={8.2} r={2.6} />
      <path d="M3.3 20.3V17.6A4.4 4.4 0 0 1 12.1 17.6V20.3" />
      <circle cx={16.8} cy={11} r={2.1} />
      <path d="M13.4 20.3V19.2A3.4 3.4 0 0 1 20.2 19.2V20.3" />
      <circle className="pbg-halo" cx={13.2} cy={4.7} r={3} fill="currentColor" stroke="none" />
      <path
        className="pbg-fheart"
        d="M13.2 6.45C12.3 5.85 11.3 5.05 11.3 4.05C11.3 3.45 11.8 2.95 12.4 2.95C12.8 2.95 13.1 3.15 13.2 3.45C13.3 3.15 13.6 2.95 14 2.95C14.6 2.95 15.1 3.45 15.1 4.05C15.1 5.05 14.1 5.85 13.2 6.45Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
}

export function Glyph({ name, size = 20, animated = false, tone = 'current', className, title, theme = 'auto' }: GlyphProps) {
  const uid = useBrandId('pg')
  const draw = DRAW[name]
  const themeCls = theme === 'dark' ? ' pb-t-dark' : theme === 'light' ? ' pb-t-light' : ''
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`pb-t pb-glyph${themeCls}${animated ? ' is-animated' : ''}${className ? ' ' + className : ''}`}
      style={tone === 'identity' ? { color: `var(--pb-c-${name})` } : undefined}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-glyph={name}
    >
      {draw(uid)}
    </svg>
  )
}
