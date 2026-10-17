import { cn } from '@/lib/cn'

export const DISCLAIMER =
  'Research proof-of-concept on synthetic data. Not a medical device. Not a substitute for emergency services. If you feel unwell, call 112.'

export function Disclaimer({ className, lang = 'en', text }: { className?: string; lang?: 'en' | 'hi'; text?: string }) {
  return (
    <p lang={lang} className={cn('text-[12.5px] leading-5 text-ink-3', lang === 'hi' && 'font-devanagari', className)}>
      {text ?? DISCLAIMER}
    </p>
  )
}
