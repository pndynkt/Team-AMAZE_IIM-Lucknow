import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'soft' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-peacock-deep text-on-peacock hover:bg-peacock-deep/90 active:bg-peacock-deep/80',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2 active:bg-mist-deep/60',
  quiet: 'bg-transparent text-ink-2 hover:bg-ink/[0.05] hover:text-ink active:bg-ink/[0.08]',
  soft: 'bg-peacock-soft text-peacock-deep hover:bg-peacock-soft/70 dark:text-ink',
  danger: 'bg-sindoor-solid text-white hover:bg-sindoor-solid/90 active:bg-sindoor-solid/80',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[10px] [&_svg]:h-3.5 [&_svg]:w-3.5',
  md: 'h-10 px-4 text-[14px] gap-2 rounded-control [&_svg]:h-4 [&_svg]:w-4',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-[14px] [&_svg]:h-[18px] [&_svg]:w-[18px]',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(BASE, VARIANT[variant], SIZE[size], className)
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

export interface LinkButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  external?: boolean
}

/** Anchor styled as a button (tel: links, downloads, external links). */
export function LinkButton({ variant = 'primary', size = 'md', icon, external, className, children, ...rest }: LinkButtonProps) {
  return (
    <a className={buttonClass(variant, size, className)} {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})} {...rest}>
      {icon}
      {children}
    </a>
  )
}

export interface RouteButtonProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
}

/** Router link styled as a button. */
export function RouteButton({ variant = 'primary', size = 'md', icon, className, children, ...rest }: RouteButtonProps) {
  return (
    <Link className={buttonClass(variant, size, typeof className === 'string' ? className : undefined)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}
