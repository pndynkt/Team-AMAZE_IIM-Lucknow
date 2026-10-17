// Loading state: the animated mark with a short label, centred.
import { Mark } from './Mark'
import './brand.css'

export interface BrandLoaderProps {
  label?: string
  className?: string
  /** mark size in px; 72 by default, 48 for compact panels */
  size?: number
  /** colour scheme: follow the page, or force one */
  theme?: 'auto' | 'light' | 'dark'
}

export function BrandLoader({ label = 'Loading', className, size = 72, theme = 'auto' }: BrandLoaderProps) {
  const t = theme === 'dark' ? ' pb-t-dark' : theme === 'light' ? ' pb-t-light' : ''
  return (
    <div className={`pb-t pb-loader${t}${className ? ' ' + className : ''}`} role="status" aria-live="polite">
      <Mark size={size} animated reflection title="" theme={theme} />
      <span className="pb-loader-label">{label}</span>
    </div>
  )
}
