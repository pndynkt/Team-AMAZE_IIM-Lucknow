// Chart colours and shared axis props, read from the CSS variables in src/index.css so both themes work.
// Rules (DESIGN.md): measured values are ink, the forecast is peacock and dashed, the fan is peacock at
// low alpha, the person's usual range is a mist-deep band, NightSignal tints use the tier colours.
export const C = {
  ink: 'var(--hex-ink)',
  ink2: 'var(--hex-ink-2)',
  ink3: 'var(--hex-ink-3)',
  line: 'var(--line)',
  surface: 'var(--hex-surface)',
  surface2: 'var(--hex-surface-2)',
  mist: 'var(--hex-mist)',
  mistDeep: 'var(--hex-mist-deep)',
  peacock: 'var(--hex-peacock)',
  peacockDeep: 'var(--hex-peacock-deep)',
  sandalwood: 'var(--hex-sandalwood)',
  lotus: 'var(--hex-lotus)',
  leaf: 'var(--hex-leaf)',
  turmeric: 'var(--hex-turmeric)',
  sindoor: 'var(--hex-sindoor)',
  stone: 'var(--hex-stone)',
  // feature groups: wearable stream peacock, health record sandalwood
  wearable: 'var(--hex-peacock)',
  ehr: 'var(--hex-sandalwood)',
} as const

/** Fan and band opacities, kept in one place so every chart reads the same. */
export const FAN_OPACITY = 0.16
export const BAND_OPACITY = 0.75

/** NightSignal tint under the measured line: the tier fill colours. */
export const NS_COLOR = { green: 'var(--hex-leaf-fill)', yellow: 'var(--hex-turmeric-fill)', red: 'var(--hex-sindoor-fill)' } as const
export const NS_OPACITY = 0.16

export const axisTick = { fontSize: 11.5, fill: C.ink3, fontFamily: 'inherit' } as const
export const axisLine = { stroke: 'var(--line-strong)' } as const

export const gridProps = { stroke: C.line, vertical: false, strokeDasharray: '0' } as const

export const cursorStyle = { stroke: 'var(--hex-ink-3)', strokeWidth: 1, strokeDasharray: '3 3' } as const

/**
 * Label for the person's usual-range band, drawn just under the band so it never sits on the line.
 * Recharts calls this with the band's viewBox.
 */
export function bandLabel(text: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function BandLabel(props: any): React.ReactElement<SVGElement> {
    const vb = props?.viewBox as { x?: number; y?: number; width?: number; height?: number } | undefined
    if (!vb || vb.x === undefined || vb.y === undefined) return <g />
    return (
      <text x={vb.x + 6} y={vb.y + (vb.height ?? 0) + 13} fontSize={11} fill={C.ink2} style={{ fontFamily: 'inherit' }}>
        {text}
      </text>
    )
  }
}
