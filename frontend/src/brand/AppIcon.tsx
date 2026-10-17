// App icon: the mark in white and dawn tones on a deep tide tile, with a continuous corner.
// Self-contained (literal colours, no CSS), so the same drawing is exported to public/.
import { MarkArt, MarkSmallArt, TILE_PALETTE, useBrandId } from './Mark'
import { SQUIRCLE_100 } from './paths'

export interface AppIconProps {
  size?: number
  className?: string
  title?: string
  /** squircle for display; square for platforms that apply their own mask (apple-touch-icon) */
  shape?: 'squircle' | 'square'
}

export function AppIcon({ size = 64, className, title = 'Pratibimb', shape = 'squircle' }: AppIconProps) {
  const uid = useBrandId('pi')
  const small = size < 40
  const detail = size >= 120 ? 'lg' : 'md'
  // stroke weights tuned per size so the icon reads at every step
  const ringW = small ? 0 : size >= 120 ? 3.1 : 3.6
  const streamW = +(ringW * 0.86).toFixed(2)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#10302F" />
          <stop offset="0.62" stopColor="#0A5A5E" />
          <stop offset="1" stopColor="#086A70" />
        </linearGradient>
        <radialGradient id={`${uid}-dawn`} cx="50" cy={small ? 66 : 59} r="56" gradientUnits="userSpaceOnUse" gradientTransform={`translate(0 ${small ? 66 : 59}) scale(1 0.5) translate(0 ${small ? -66 : -59})`}>
          <stop offset="0" stopColor="#F6C7A6" stopOpacity="0.34" />
          <stop offset="0.5" stopColor="#F6C7A6" stopOpacity="0.1" />
          <stop offset="1" stopColor="#F6C7A6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.07" />
          <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        {shape === 'squircle' && (
          <clipPath id={`${uid}-clip`}>
            <path d={SQUIRCLE_100} />
          </clipPath>
        )}
      </defs>
      <g clipPath={shape === 'squircle' ? `url(#${uid}-clip)` : undefined}>
        <rect width="100" height="100" fill={`url(#${uid}-bg)`} />
        <rect width="100" height="100" fill={`url(#${uid}-dawn)`} />
        <rect width="100" height="100" fill={`url(#${uid}-sheen)`} />
        {small ? (
          <svg x="7.3" y="4.5" width="85.4" height="85.4" viewBox="0 0 32 32" overflow="visible">
            <MarkSmallArt uid={`${uid}m`} palette={TILE_PALETTE} weight={1.16} />
          </svg>
        ) : (
          <svg x="4" y="5" width="92" height="92" viewBox="0 0 120 120" overflow="visible">
            <MarkArt
              uid={`${uid}m`}
              detail={detail}
              palette={TILE_PALETTE}
              ringW={ringW}
              streamW={streamW}
              reflection
              motion={false}
              assembleRipple={false}
            />
          </svg>
        )}
      </g>
    </svg>
  )
}
