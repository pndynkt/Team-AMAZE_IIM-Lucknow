// The Pratibimb mark: two streams, one reflection.
// A peacock live pulse (left) and a sandalwood record ledger (right) meet on the waterline;
// where they meet the ring, the twin, rises and rests on the water, mirrored below.
import { useEffect, useId, useState, type CSSProperties } from 'react'
import './brand.css'
import {
  BANDS_LG,
  BANDS_MD,
  CX,
  CY,
  H,
  LEDGER_LEN,
  LEDGER_LG,
  LEDGER_MD,
  LOTUS_TIP,
  LOTUS_TIP_Y,
  MD_CROP,
  PULSE_LG,
  PULSE_MD,
  R,
  REFLECT_DEPTH,
  REFLECT_K,
  RING_LEFT,
  RING_LOOP,
  RING_RIGHT,
  SM,
  VB,
} from './paths'

export interface MarkProps {
  size?: number
  /** run the looping motion (pulse drawing, ripple, breathing ring) */
  animated?: boolean
  /** draw the reflection under the waterline (off for tiny sizes) */
  reflection?: boolean
  /** play the one-time assemble sequence on mount (landing hero) */
  assemble?: boolean
  className?: string
  title?: string
  /** colour scheme: follow the page (html.dark or a .pb-dark wrapper), or force one */
  theme?: 'auto' | 'light' | 'dark'
  /** 32 px and below: show the short record ledger right of the ring (the wordmark turns it off) */
  stub?: boolean
}

/** Colours the art is painted with. CSS variables for the live mark, literal hex for exported icons. */
export interface MarkPalette {
  peacock: string
  sandal: string
  lotus: string
  glint: string
  dawn: string
  hair: string
  hairOpacity: number | string
  glowOpacity: number | string
  reflOpacity: number | string
  haloOpacity: number | string
}

export const THEMED_PALETTE: MarkPalette = {
  peacock: 'var(--pb-peacock)',
  sandal: 'var(--pb-sandal)',
  lotus: 'var(--pb-lotus)',
  glint: 'var(--pb-glint)',
  dawn: 'var(--pb-dawn)',
  hair: 'var(--pb-ink)',
  hairOpacity: 'var(--pb-hair-o)',
  glowOpacity: 'var(--pb-glow-o)',
  reflOpacity: 'var(--pb-refl-o)',
  haloOpacity: 'var(--pb-halo-o)',
}

/** White and dawn tones for the app icon tile. */
export const TILE_PALETTE: MarkPalette = {
  peacock: '#FFFFFF',
  sandal: '#F6C7A6',
  lotus: '#FFA9C6',
  glint: '#FFFFFF',
  dawn: '#F6C7A6',
  hair: '#FFFFFF',
  hairOpacity: 0.2,
  glowOpacity: 0.42,
  reflOpacity: 0.34,
  haloOpacity: 0,
}

type Vars = CSSProperties & Record<`--${string}`, string>

function mul(o: number | string, k: number): number | string {
  return typeof o === 'number' ? +(o * k).toFixed(3) : `calc(${o} * ${k})`
}

/** Stable, selector-safe id prefix for gradients, masks and clips. */
export function useBrandId(prefix = 'pb'): string {
  return prefix + useId().replace(/[^a-zA-Z0-9]/g, '')
}

/** True when the visitor asked for reduced motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      return false
    }
  })
  useEffect(() => {
    let mq: MediaQueryList
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    } catch {
      return
    }
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

interface SceneProps {
  uid: string
  detail: 'lg' | 'md'
  palette: MarkPalette
  ringW: number
  streamW: number
  /** the visible copy carries the assemble classes; reflected copies do not */
  primary: boolean
}

/** Ring, pulse, lotus peak and ledger: everything above the waterline. */
function Scene({ uid, detail, palette, ringW, streamW, primary }: SceneProps) {
  const pulse = detail === 'lg' ? PULSE_LG : PULSE_MD
  const ledger = detail === 'lg' ? LEDGER_LG : LEDGER_MD
  const p = primary ? '' : ' pb-copy'
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <g className={'pb-ring' + p}>
        <path className="pb-ring-half" d={RING_LEFT} pathLength={1} stroke={`url(#${uid}-ring)`} strokeWidth={ringW} />
        <path className="pb-ring-half" d={RING_RIGHT} pathLength={1} stroke={`url(#${uid}-ring)`} strokeWidth={ringW} />
      </g>
      <path className="pb-pulse" d={pulse} pathLength={1} stroke={`url(#${uid}-pf)`} strokeWidth={streamW} />
      <g className="pb-lotus-pop">
        <path className="pb-lotus" d={LOTUS_TIP} stroke={`url(#${uid}-lt)`} strokeWidth={streamW + 0.2} />
      </g>
      <g style={{ stroke: palette.sandal }} strokeWidth={streamW}>
        {ledger.map((s, i) => (
          <path
            key={s.x}
            className="pb-seg"
            d={`M${s.x} ${H}h${LEDGER_LEN}`}
            strokeOpacity={s.o}
            style={{ '--d': `${((ledger.length - 1 - i) * 0.13).toFixed(2)}s` } as Vars}
          />
        ))}
      </g>
    </g>
  )
}

export interface MarkArtProps {
  uid: string
  detail: 'lg' | 'md'
  palette: MarkPalette
  ringW: number
  streamW: number
  reflection: boolean
  /** include loop-only elements (travelling highlight, ripples) */
  motion: boolean
  /** include the one-time ripple of the assemble sequence */
  assembleRipple: boolean
  glow?: boolean
}

/** The full mark drawn into a 120 x 120 user space. Render inside an svg with viewBox 0 0 120 120. */
export function MarkArt({ uid, detail, palette, ringW, streamW, reflection, motion, assembleRipple, glow = true }: MarkArtProps) {
  const bands = detail === 'lg' ? BANDS_LG : BANDS_MD
  const pulse = detail === 'lg' ? PULSE_LG : PULSE_MD
  const mirror = `translate(0 ${H}) scale(1 ${-REFLECT_K}) translate(0 ${-H})`
  const stop = (offset: number, color: string, opacity: number | string = 1) => (
    <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
  )
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-ring`} gradientUnits="userSpaceOnUse" x1={CX - R} y1={0} x2={CX + R} y2={0}>
          {stop(0.36, palette.peacock)}
          {stop(0.64, palette.sandal)}
        </linearGradient>
        <linearGradient id={`${uid}-pf`} gradientUnits="userSpaceOnUse" x1={detail === 'lg' ? 6 : 12} y1={0} x2={CX} y2={0}>
          {stop(0, palette.peacock, 0)}
          {stop(0.3, palette.peacock)}
        </linearGradient>
        <linearGradient id={`${uid}-lt`} gradientUnits="userSpaceOnUse" x1={0} y1={LOTUS_TIP_Y.from} x2={0} y2={LOTUS_TIP_Y.to}>
          {stop(0, palette.lotus, 0)}
          {stop(1, palette.lotus)}
        </linearGradient>
        <linearGradient
          id={`${uid}-hair`}
          gradientUnits="userSpaceOnUse"
          x1={detail === 'lg' ? 2 : MD_CROP.x}
          y1={0}
          x2={detail === 'lg' ? VB - 2 : MD_CROP.x + MD_CROP.size}
          y2={0}
        >
          {stop(0, palette.hair, 0)}
          {stop(0.22, palette.hair, palette.hairOpacity)}
          {stop(0.78, palette.hair, palette.hairOpacity)}
          {stop(1, palette.hair, 0)}
        </linearGradient>
        {glow && (
          <radialGradient
            id={`${uid}-glow`}
            gradientUnits="userSpaceOnUse"
            cx={CX}
            cy={H}
            r={44}
            gradientTransform={`translate(0 ${H}) scale(1 0.34) translate(0 ${-H})`}
          >
            {stop(0, palette.dawn, palette.glowOpacity)}
            {stop(0.5, palette.dawn, mul(palette.glowOpacity, 0.4))}
            {stop(1, palette.dawn, 0)}
          </radialGradient>
        )}
        {reflection && (
          <>
            <linearGradient id={`${uid}-vf`} gradientUnits="userSpaceOnUse" x1={0} y1={H} x2={0} y2={H + REFLECT_DEPTH}>
              <stop offset={0} stopColor="#fff" stopOpacity={1} />
              <stop offset={0.55} stopColor="#fff" stopOpacity={0.45} />
              <stop offset={1} stopColor="#fff" stopOpacity={0} />
            </linearGradient>
            <mask id={`${uid}-m`} maskUnits="userSpaceOnUse" x={0} y={H} width={VB} height={VB - H}>
              <rect x={0} y={H + 0.5} width={VB} height={REFLECT_DEPTH} fill={`url(#${uid}-vf)`} />
            </mask>
            {bands.map(([a, b], i) => (
              <clipPath key={i} id={`${uid}-b${i}`}>
                <rect x={0} y={H + a} width={VB} height={b - a} />
              </clipPath>
            ))}
          </>
        )}
        {(motion || assembleRipple) && (
          <clipPath id={`${uid}-rc`}>
            <rect x={0} y={H + 0.6} width={VB} height={VB - H} />
          </clipPath>
        )}
      </defs>

      {glow && <ellipse className="pb-glow" cx={CX} cy={H} rx={44} ry={15} fill={`url(#${uid}-glow)`} />}
      <path className="pb-horizon" d={`M2 ${H}H${VB - 2}`} stroke={`url(#${uid}-hair)`} strokeWidth={0.7} fill="none" />

      {reflection && (
        <g className="pb-refl" mask={`url(#${uid}-m)`}>
          <g style={{ opacity: palette.reflOpacity }}>
            {bands.map((_, i) => (
              <g key={i} clipPath={`url(#${uid}-b${i})`}>
                <g className="pb-band" style={{ '--bd': `${(-i * 0.85).toFixed(2)}s` } as Vars}>
                  <g transform={mirror}>
                    <Scene uid={uid} detail={detail} palette={palette} ringW={ringW} streamW={streamW} primary={false} />
                  </g>
                </g>
              </g>
            ))}
          </g>
        </g>
      )}

      {(motion || assembleRipple) && (
        <g clipPath={`url(#${uid}-rc)`} fill="none" style={{ stroke: palette.peacock }}>
          {assembleRipple && <ellipse className="pb-ripple-once" cx={CX} cy={H} rx={46} ry={8.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          {motion && (
            <>
              <ellipse className="pb-ripple" cx={CX} cy={H} rx={46} ry={8.5} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ '--rd': '2.1s' } as Vars} />
              <ellipse className="pb-ripple" cx={CX} cy={H} rx={46} ry={8.5} strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ '--rd': '5.6s' } as Vars} />
            </>
          )}
        </g>
      )}

      <Scene uid={uid} detail={detail} palette={palette} ringW={ringW} streamW={streamW} primary />

      {motion && (
        <g className="pb-glint-o" fill="none" strokeLinecap="round" style={{ stroke: palette.glint }}>
          <path className="pb-glint" d={pulse + RING_LOOP} pathLength={100} strokeWidth={streamW * 2} style={{ strokeOpacity: palette.haloOpacity }} />
          <path className="pb-glint" d={pulse + RING_LOOP} pathLength={100} strokeWidth={streamW * 0.55} strokeOpacity={0.95} />
        </g>
      )}
    </>
  )
}

export interface MarkSmallArtProps {
  uid: string
  palette: MarkPalette
  /** stroke multiplier, for the favicon */
  weight?: number
  /** draw the short record ledger */
  ledger?: boolean
}

/** The 32 px drawing: ring, pulse peak and a short ledger. Render inside viewBox 0 0 32 32. */
export function MarkSmallArt({ uid, palette, weight = 1, ledger = true }: MarkSmallArtProps) {
  const ringW = SM.ring * weight
  const streamW = SM.stream * weight
  const stop = (offset: number, color: string, opacity: number | string = 1) => (
    <stop offset={offset} style={{ stopColor: color, stopOpacity: opacity }} />
  )
  return (
    <>
      <defs>
        <linearGradient id={`${uid}-ring`} gradientUnits="userSpaceOnUse" x1={SM.cx - SM.r} y1={0} x2={SM.cx + SM.r} y2={0}>
          {stop(0.34, palette.peacock)}
          {stop(0.66, palette.sandal)}
        </linearGradient>
        <linearGradient id={`${uid}-pf`} gradientUnits="userSpaceOnUse" x1={1} y1={0} x2={SM.cx} y2={0}>
          {stop(0, palette.peacock, 0.3)}
          {stop(0.32, palette.peacock)}
        </linearGradient>
        <linearGradient id={`${uid}-lt`} gradientUnits="userSpaceOnUse" x1={0} y1={SM.lotusY.from} x2={0} y2={SM.lotusY.to}>
          {stop(0, palette.lotus, 0)}
          {stop(1, palette.lotus)}
        </linearGradient>
      </defs>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx={SM.cx} cy={SM.h - SM.r} r={SM.r} stroke={`url(#${uid}-ring)`} strokeWidth={ringW} />
        <path d={SM.pulse} stroke={`url(#${uid}-pf)`} strokeWidth={streamW} />
        <path d={SM.lotus} stroke={`url(#${uid}-lt)`} strokeWidth={streamW + 0.15} />
        {ledger && (
          <g style={{ stroke: palette.sandal }} strokeWidth={streamW}>
            {SM.ledger.map((s) => (
              <path key={s.d} d={s.d} strokeOpacity={s.o} />
            ))}
          </g>
        )}
      </g>
    </>
  )
}

function themeClass(theme: MarkProps['theme']): string {
  return theme === 'dark' ? ' pb-t-dark' : theme === 'light' ? ' pb-t-light' : ''
}

export function Mark({
  size = 28,
  animated = false,
  reflection = true,
  assemble = false,
  className,
  title = 'Pratibimb',
  theme = 'auto',
  stub = true,
}: MarkProps) {
  const uid = useBrandId()
  const reduced = useReducedMotion()
  const small = size <= 32
  const cls = (extra: string) => `pb-t pb-mark${themeClass(theme)}${extra}${className ? ' ' + className : ''}`
  // an empty title means the mark is decorative (for example inside the wordmark)
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true as const }

  if (small) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${SM.vb} ${SM.vb}`} className={cls(' pb-mark-sm')} {...a11y}>
        <MarkSmallArt uid={uid} palette={THEMED_PALETTE} ledger={stub} />
      </svg>
    )
  }

  const detail = size >= 120 ? 'lg' : 'md'
  // stroke weights are set in pixels: about 1.9 to 2.7 px through the medium range, then they scale
  const ringW = detail === 'lg' ? 2.6 : +(((1.9 + size * 0.007) * MD_CROP.size) / size).toFixed(2)
  const streamW = +(ringW * 0.85).toFixed(2)
  const motion = animated && !reduced
  // without the reflection, centre what is above the water
  const viewBox =
    detail === 'lg'
      ? `0 ${reflection ? 0 : -12.3} ${VB} ${VB}`
      : `${MD_CROP.x} ${reflection ? MD_CROP.y : MD_CROP.yNoReflection} ${MD_CROP.size} ${MD_CROP.size}`

  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={cls(`${animated ? ' is-animated' : ''}${assemble ? ' is-assembling' : ''}`)}
      {...a11y}
      data-detail={detail}
    >
      <MarkArt
        uid={uid}
        detail={detail}
        palette={THEMED_PALETTE}
        ringW={ringW}
        streamW={streamW}
        reflection={reflection}
        motion={motion}
        assembleRipple={assemble && reflection && !reduced}
      />
    </svg>
  )
}

// Geometry re-exported for the icon and the glyph set.
export const MARK_GEOMETRY = { VB, CX, CY, H, R }
