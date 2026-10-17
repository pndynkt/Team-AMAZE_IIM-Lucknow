// Console theme preference. The landing page, the guide and the patient view always stay light;
// the dark class is only on <html> while a console route is mounted.

export type Theme = 'light' | 'dark'
const KEY = 'pratibimb-theme'

export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function writeTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

export function setDarkClass(on: boolean) {
  document.documentElement.classList.toggle('dark', on)
}

/** Called before first paint: dark only when the stored choice is dark and the URL is a console route. */
export function applyConsoleTheme(location: string) {
  setDarkClass(readTheme() === 'dark' && /(^|#)\/console/.test(location))
}
