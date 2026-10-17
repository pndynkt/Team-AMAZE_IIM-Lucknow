import { createContext, useContext } from 'react'
import { en, type Strings } from './en'
import { hi } from './hi'

export type Lang = 'en' | 'hi'

export const STRINGS: Record<Lang, Strings> = { en, hi }

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: 'en',
  setLang: () => {},
})

export function useLang() {
  const ctx = useContext(LangContext)
  return { ...ctx, t: STRINGS[ctx.lang] }
}
