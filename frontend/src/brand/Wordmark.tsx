// Wordmark: the mark plus "Pratibimb" in Figtree 650. The waterline of the mark sits exactly on the
// text baseline, and the ring rises a touch above cap height, the way round letters overshoot.
import '@fontsource-variable/figtree'
import '@fontsource/mukta/500.css'
import type { CSSProperties } from 'react'
import { Mark } from './Mark'
import { H, MD_CROP, MD_LEDGER_END, SM } from './paths'
import './brand.css'

// Figtree: cap height 0.70 em, ascent 0.95 em, descent 0.25 em. With line-height 1 the
// baseline sits 0.85 em below the top of the line box.
const BASELINE_EM = 0.85

type Size = 'sm' | 'md' | 'lg'
interface Spec {
  mark: number
  font: number
  reflection: boolean
}
const SPEC: Record<Size, Spec> = {
  sm: { mark: 22, font: 16, reflection: false },
  md: { mark: 30, font: 21.5, reflection: false },
  lg: { mark: 58, font: 40, reflection: true },
}

interface Layout {
  markStyle: CSSProperties
  textStyle: CSSProperties
}

function layout(spec: Spec): Layout {
  const { mark: S, font: F, reflection } = spec
  const small = S <= 32
  // waterline position inside the rendered mark, in px from its top edge
  const top = reflection ? MD_CROP.y : MD_CROP.yNoReflection
  const horizon = small ? (SM.h / SM.vb) * S : ((H - top) / MD_CROP.size) * S
  // empty space to the right of the last ledger segment, in px
  const pad = small ? ((SM.vb - SM.ringEnd) / SM.vb) * S : ((MD_CROP.x + MD_CROP.size - MD_LEDGER_END) / MD_CROP.size) * S
  const offset = BASELINE_EM * F - horizon
  const gap = (small ? 0.2 : 0.26) * F - pad
  return {
    markStyle: { marginTop: Math.max(0, offset), marginRight: gap, display: 'block' },
    textStyle: { marginTop: Math.max(0, -offset), fontSize: F, lineHeight: 1 },
  }
}

export interface WordmarkProps {
  size?: Size
  animated?: boolean
  className?: string
  theme?: 'auto' | 'light' | 'dark'
}

function themeClass(theme: WordmarkProps['theme']) {
  return theme === 'dark' ? ' pb-t-dark' : theme === 'light' ? ' pb-t-light' : ''
}

export function Wordmark({ size = 'md', animated = false, className, theme = 'auto' }: WordmarkProps) {
  const spec = SPEC[size]
  const { markStyle, textStyle } = layout(spec)
  return (
    <span
      className={`pb-t pb-wordmark${themeClass(theme)}${className ? ' ' + className : ''}`}
      style={{ alignItems: 'flex-start' }}
      aria-label="Pratibimb"
      role="img"
    >
      <span style={markStyle} aria-hidden>
        <Mark size={spec.mark} animated={animated} reflection={spec.reflection} theme={theme} title="" stub={false} />
      </span>
      <span className="pb-wordmark-text" style={textStyle} aria-hidden>
        Pratibimb
      </span>
    </span>
  )
}

export interface WordmarkBilingualProps {
  size?: 'md' | 'lg'
  animated?: boolean
  className?: string
  theme?: 'auto' | 'light' | 'dark'
}

/** Latin and Devanagari lockup: "Pratibimb" over "प्रतिबिम्ब". */
export function WordmarkBilingual({ size = 'md', animated = false, className, theme = 'auto' }: WordmarkBilingualProps) {
  const spec: Spec = size === 'lg' ? { mark: 58, font: 40, reflection: true } : { mark: 30, font: 21.5, reflection: false }
  const { markStyle, textStyle } = layout(spec)
  const deva = spec.font * 0.6
  return (
    <span
      className={`pb-t pb-wordmark${themeClass(theme)}${className ? ' ' + className : ''}`}
      style={{ alignItems: 'flex-start' }}
      aria-label="Pratibimb, प्रतिबिम्ब"
      role="img"
    >
      <span style={markStyle} aria-hidden>
        <Mark size={spec.mark} animated={animated} reflection={spec.reflection} theme={theme} title="" stub={false} />
      </span>
      <span className="pb-wordmark-stack" style={{ marginTop: textStyle.marginTop }} aria-hidden>
        <span className="pb-wordmark-text" style={{ fontSize: spec.font, lineHeight: 1 }}>
          Pratibimb
        </span>
        <span className="pb-wordmark-deva" lang="hi" style={{ fontSize: deva, marginTop: spec.font * 0.26, marginLeft: spec.font * 0.03 }}>
          प्रतिबिम्ब
        </span>
      </span>
    </span>
  )
}
