import type { Config } from 'tailwindcss'
import forms from '@tailwindcss/forms'

// Every colour is a CSS variable (see src/index.css) so light and dark themes
// swap at the :root level without touching component code.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        mist: v('mist'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        'mist-deep': v('mist-deep'),
        ink: v('ink'),
        'ink-2': v('ink-2'),
        'ink-3': v('ink-3'),
        peacock: v('peacock'),
        'peacock-deep': v('peacock-deep'),
        'peacock-soft': v('peacock-soft'),
        'on-peacock': v('on-peacock'),
        sandalwood: v('sandalwood'),
        'sandalwood-text': v('sandalwood-text'),
        'sandalwood-soft': v('sandalwood-soft'),
        lotus: v('lotus'),
        'lotus-text': v('lotus-text'),
        'lotus-soft': v('lotus-soft'),
        dawn: v('dawn'),
        'dawn-glow': v('dawn-glow'),
        leaf: v('leaf'),
        'leaf-soft': v('leaf-soft'),
        turmeric: v('turmeric'),
        'turmeric-soft': v('turmeric-soft'),
        sindoor: v('sindoor'),
        'sindoor-soft': v('sindoor-soft'),
        'sindoor-solid': v('sindoor-solid'),
        stone: v('stone'),
        'stone-soft': v('stone-soft'),
        'm-rhr': v('m-rhr'),
        'm-hrv': v('m-hrv'),
        'm-bp': v('m-bp'),
        'm-sleep': v('m-sleep'),
        'm-steps': v('m-steps'),
        'm-spo2': v('m-spo2'),
        'm-resp': v('m-resp'),
        'm-record': v('m-record'),
      },
      borderColor: {
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
      },
      backgroundColor: {
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
      },
      fontFamily: {
        sans: ['"Figtree Variable"', 'Figtree', 'Mukta', 'system-ui', 'sans-serif'],
        devanagari: ['Mukta', '"Figtree Variable"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['4rem', { lineHeight: '1.05', letterSpacing: '-0.035em', fontWeight: '650' }],
        h1: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '650' }],
        h2: ['1.75rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '620' }],
        h3: ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['1rem', { lineHeight: '1.55' }],
        console: ['0.9375rem', { lineHeight: '1.5' }],
        small: ['0.8125rem', { lineHeight: '1.4' }],
        caption: ['0.75rem', { lineHeight: '1.35' }],
      },
      fontWeight: {
        620: '620',
        650: '650',
      },
      borderRadius: {
        panel: '22px',
        block: '14px',
        control: '12px',
      },
      boxShadow: {
        rest: 'var(--shadow-rest)',
        lift: 'var(--shadow-lift)',
      },
      maxWidth: {
        landing: '1120px',
        console: '1360px',
        phone: '440px',
        prose: '68ch',
      },
      width: {
        rail: '232px',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.8s linear infinite',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [forms({ strategy: 'class' })],
} satisfies Config
