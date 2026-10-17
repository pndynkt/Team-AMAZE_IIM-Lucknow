// Review page for the brand system, served at /brand.
// Styled with its own stylesheet and literal DESIGN.md values so it renders the same while page tokens change.
import '@fontsource-variable/figtree'
import { useEffect, useState } from 'react'
import { AppIcon } from './AppIcon'
import { BrandLoader } from './BrandLoader'
import { Glyph, GLYPH_META, GLYPH_NAMES } from './Glyph'
import { Mark } from './Mark'
import { Wordmark, WordmarkBilingual } from './Wordmark'
import './brand-sheet.css'

type Theme = 'light' | 'dark'

function initialTheme(): Theme {
  try {
    const q = new URLSearchParams(window.location.search).get('theme')
    if (q === 'dark' || q === 'light') return q
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

const SIZES = [16, 24, 32, 48, 96]

function PulseSwatch() {
  return (
    <svg width="30" height="14" viewBox="0 0 30 14" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 9H10L11 10L13 3L15 12L16 9H28" stroke="#0B7F86" strokeWidth="1.8" />
      <path d="M12.3 5.6L13 3L13.7 5.6" stroke="#D9668E" strokeWidth="1.9" />
    </svg>
  )
}
function LedgerSwatch() {
  return (
    <svg width="30" height="14" viewBox="0 0 30 14" fill="none" strokeLinecap="round" aria-hidden>
      <path d="M3 7h5M12.5 7h5M22 7h5" stroke="#A8703C" strokeWidth="1.8" />
    </svg>
  )
}
function Dot({ color, glow }: { color: string; glow?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 12,
        height: 12,
        borderRadius: 999,
        background: color,
        boxShadow: glow ? `0 0 0 5px ${color}40, 0 0 14px 6px ${color}55` : undefined,
      }}
    />
  )
}

function GlyphGrid({ dark }: { dark: boolean }) {
  return (
    <div className="pbs-glyphs">
      {GLYPH_NAMES.map((n) => (
        <div className="pbs-glyph" key={n}>
          <div
            className={`pbs-glyph-tile pb-t${dark ? ' pb-t-dark' : ' pb-t-light'}`}
            style={{ background: `color-mix(in srgb, var(--pb-c-${n}) ${dark ? 14 : 9}%, transparent)` }}
          >
            <Glyph name={n} size={40} animated tone="identity" theme={dark ? 'dark' : 'light'} title={GLYPH_META[n].label} />
          </div>
          <div className="pbs-glyph-name">
            <span>{GLYPH_META[n].label}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <code>{n}</code>
              <span className="pbs-glyph-static">
                <Glyph name={n} size={20} />
              </span>
            </span>
          </div>
          <div className="pbs-glyph-motion">{GLYPH_META[n].motion}</div>
        </div>
      ))}
    </div>
  )
}

export default function BrandSheet() {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [run, setRun] = useState(0)
  const dark = theme === 'dark'

  useEffect(() => {
    const prev = document.title
    document.title = 'Pratibimb brand system'
    return () => {
      document.title = prev
    }
  }, [])

  return (
    <div className={`pbs ${dark ? 'pb-dark' : 'pb-light'}`} data-theme={theme}>
      <div className="pbs-wrap">
        <header className="pbs-top">
          <Wordmark size="md" theme={theme} />
          <div className="pbs-seg" role="group" aria-label="Page theme">
            <button type="button" aria-pressed={!dark} onClick={() => setTheme('light')}>
              Light
            </button>
            <button type="button" aria-pressed={dark} onClick={() => setTheme('dark')}>
              Dark
            </button>
          </div>
        </header>

        <section className="pbs-hero" aria-labelledby="pbs-title">
          <div className="pbs-stage" data-shot="hero-stage">
            <div data-shot="hero-mark" style={{ lineHeight: 0 }}>
              <Mark key={run} size={260} animated reflection assemble theme={theme} />
            </div>
            <div className="pbs-stage-foot">
              <span className="pbs-small">Assembles once, then breathes</span>
              <button type="button" className="pbs-btn" onClick={() => setRun((r) => r + 1)} data-shot="replay">
                Replay
              </button>
            </div>
          </div>
          <div>
            <h1 className="pbs-h1" id="pbs-title">
              Two streams, one reflection
            </h1>
            <p className="pbs-lede" style={{ marginTop: 14 }}>
              Pratibimb means reflection. The live wearable stream and the health record meet on still water, and where
              they meet the twin rises: one ring, half of each, mirrored below.
            </p>
            <ul className="pbs-legend">
              <li>
                <span className="pbs-swatch">
                  <PulseSwatch />
                </span>
                <div>
                  <b>Peacock</b> <span>is the wearable, live and continuous.</span>
                </div>
              </li>
              <li>
                <span className="pbs-swatch">
                  <LedgerSwatch />
                </span>
                <div>
                  <b>Sandalwood</b> <span>is the health record, kept in even entries.</span>
                </div>
              </li>
              <li>
                <span className="pbs-swatch">
                  <Dot color="#D9668E" />
                </span>
                <div>
                  <b>Lotus</b> <span>is the heartbeat, the one warm peak in the pulse.</span>
                </div>
              </li>
              <li>
                <span className="pbs-swatch">
                  <Dot color="#F6C7A6" glow />
                </span>
                <div>
                  <b>Dawn glow</b> <span>is light on the water. Decorative only.</span>
                </div>
              </li>
            </ul>
            <dl className="pbs-facts">
              <div>
                <dt>Assemble</dt>
                <dd className="pbs-num">2 s, once</dd>
              </div>
              <div>
                <dt>Loop</dt>
                <dd className="pbs-num">9 s light, 4.5 s breath</dd>
              </div>
              <div>
                <dt>Reduced motion</dt>
                <dd>Final state, still</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="pbs-section" aria-labelledby="pbs-sizes">
          <div className="pbs-section-head">
            <h2 className="pbs-h2" id="pbs-sizes">
              The mark at every size
            </h2>
            <p>At 32 px and below the mark switches to its own drawing: the ring, the pulse peak and a short ledger, with heavier strokes and no water.</p>
          </div>
          <div className="pbs-pair">
            {(['light', 'dark'] as const).map((t) => (
              <div key={t} className={`pbs-panel ${t === 'dark' ? 'is-dark pb-dark' : 'pb-light'}`} data-shot={`sizes-${t}`}>
                <div className="pbs-panel-label">{t === 'dark' ? 'On #0E1A1A' : 'On white'}</div>
                <div className="pbs-sizes">
                  {SIZES.map((s) => (
                    <div className="pbs-size" key={s}>
                      <Mark size={s} theme={t} />
                      <span className="pbs-size-cap">{s} px</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="pbs-section" aria-labelledby="pbs-icons">
          <div className="pbs-section-head">
            <h2 className="pbs-h2" id="pbs-icons">
              App icon and favicon
            </h2>
            <p>A deep tide tile with a continuous corner, the mark in white and dawn tones. The favicon uses the small drawing so it holds at 16 px.</p>
          </div>
          <div className="pbs-panel is-mist" data-shot="icons">
            <div className="pbs-icons">
              {[180, 120, 64].map((s) => (
                <div className="pbs-size" key={s} data-shot={`icon-${s}`}>
                  <AppIcon size={s} />
                  <span className="pbs-size-cap">{s} px</span>
                </div>
              ))}
              <div className="pbs-size" data-shot="favicon-32">
                <AppIcon size={32} />
                <span className="pbs-size-cap">32 px</span>
              </div>
              <div className="pbs-size" data-shot="favicon-16">
                <AppIcon size={16} />
                <span className="pbs-size-cap">16 px</span>
              </div>
            </div>
            <div className="pbs-tabs" data-shot="tabs">
              {(['light', 'dark'] as const).map((t) => (
                <div key={t} className={`pbs-tabbar${t === 'dark' ? ' is-dark' : ''}`}>
                  <div className="pbs-tab">
                    <AppIcon size={16} title="" />
                    <span>Pratibimb</span>
                  </div>
                  <div className="pbs-tab is-ghost">
                    <span>Clinician console</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'none' }} aria-hidden>
            <div data-export="app-icon">
              <AppIcon size={180} />
            </div>
            <div data-export="app-icon-square">
              <AppIcon size={180} shape="square" />
            </div>
            <div data-export="favicon">
              <AppIcon size={32} />
            </div>
          </div>
        </section>

        <section className="pbs-section" aria-labelledby="pbs-word">
          <div className="pbs-section-head">
            <h2 className="pbs-h2" id="pbs-word">
              Wordmark
            </h2>
            <p>Figtree at 650 with tight tracking. The waterline of the mark sits on the text baseline. The bilingual lockup sets प्रतिबिम्ब in Mukta.</p>
          </div>
          <div className="pbs-pair">
            {(['light', 'dark'] as const).map((t) => (
              <div key={t} className={`pbs-panel ${t === 'dark' ? 'is-dark pb-dark' : 'pb-light'}`} data-shot={`wordmarks-${t}`}>
                <div className="pbs-lockups">
                  <div className="pbs-lockup">
                    <Wordmark size="sm" theme={t} />
                    <span className="pbs-size-cap">sm, console rail</span>
                  </div>
                  <div className="pbs-lockup">
                    <Wordmark size="md" theme={t} />
                    <span className="pbs-size-cap">md, page headers</span>
                  </div>
                  <div className="pbs-lockup">
                    <Wordmark size="lg" theme={t} animated />
                    <span className="pbs-size-cap">lg, landing hero</span>
                  </div>
                  <div className="pbs-lockup">
                    <WordmarkBilingual size="md" theme={t} />
                    <span className="pbs-size-cap">Bilingual</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="pbs-section" aria-labelledby="pbs-glyphs">
          <div className="pbs-section-head">
            <h2 className="pbs-h2" id="pbs-glyphs">
              Vital glyphs
            </h2>
            <p>Sixteen glyphs drawn as one family: 24 px grid, 1.75 stroke, round ends. Each moves to show what its signal does. Shown at 40 px in identity colour with motion, and at 20 px still in the current text colour.</p>
          </div>
          <div className="pbs-panel" data-shot="glyphs-light" style={{ padding: '8px 8px 4px' }}>
            <GlyphGrid dark={false} />
          </div>
          <div className="pbs-panel is-dark pb-dark" data-shot="glyphs-dark" style={{ padding: '8px 8px 4px', marginTop: 16 }}>
            <GlyphGrid dark />
          </div>
        </section>

        <section className="pbs-section" aria-labelledby="pbs-loading">
          <div className="pbs-section-head">
            <h2 className="pbs-h2" id="pbs-loading">
              Loading state
            </h2>
            <p>The animated mark at 72 px with a short label. Light travels the pulse and around the ring, the water answers with a ripple.</p>
          </div>
          <div className="pbs-pair">
            <div className="pbs-panel pb-light" data-shot="loader-light">
              <BrandLoader label="Loading the twin" />
            </div>
            <div className="pbs-panel is-dark pb-dark" data-shot="loader-dark">
              <BrandLoader label="Loading the twin" />
            </div>
          </div>
        </section>

        <section className="pbs-section" aria-labelledby="pbs-use">
          <div className="pbs-section-head">
            <h2 className="pbs-h2" id="pbs-use">
              Using the system
            </h2>
          </div>
          <ul className="pbs-rules">
            <li>
              <b>Rail and headers</b>
              <span>Wordmark size sm in the console rail, md in page headers. Both are still.</span>
            </li>
            <li>
              <b>Landing hero</b>
              <span>Mark at 220 to 280 px with assemble and animated. This is the page's one orchestrated moment.</span>
            </li>
            <li>
              <b>Loading</b>
              <span>BrandLoader with a short label in sentence case, for example "Loading the twin".</span>
            </li>
            <li>
              <b>Glyphs</b>
              <span>Still by default. Animate one glyph at a time, where the signal is the subject of the screen.</span>
            </li>
            <li>
              <b>Colour</b>
              <span>Identity tone for legends and signal labels. Current tone inside buttons, lists and chips.</span>
            </li>
            <li>
              <b>Never</b>
              <span>Stretch, recolour, outline or add effects to the mark. Never place it on a busy photo or a gradient.</span>
            </li>
          </ul>
        </section>

        <footer className="pbs-foot">Pratibimb brand system. Synthetic data project for a case competition.</footer>
      </div>
    </div>
  )
}
