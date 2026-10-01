import { useEffect, useState } from 'react'

const KEY = 'tj-appearance'
export const THEME_EVENT = 'tj-theme'

export const ACCENTS = [
  { id: 'blue', label: 'Blue', swatch: '#5b8cff' },
  { id: 'violet', label: 'Violet', swatch: '#a78bfa' },
  { id: 'teal', label: 'Teal', swatch: '#2dd4bf' },
  { id: 'amber', label: 'Amber', swatch: '#fbbf24' },
  { id: 'rose', label: 'Rose', swatch: '#fb7185' },
] as const
export type AccentId = (typeof ACCENTS)[number]['id']

export const TEXT_SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'normal', label: 'Normal' },
  { id: 'large', label: 'Large' },
] as const
export type TextSize = (typeof TEXT_SIZES)[number]['id']

export interface Appearance { accent: AccentId; text: TextSize }
export const DEFAULT_APPEARANCE: Appearance = { accent: 'blue', text: 'normal' }

export function readAppearance(): Appearance {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Appearance> | null
    if (s) {
      return {
        accent: ACCENTS.some((a) => a.id === s.accent) ? (s.accent as AccentId) : 'blue',
        text: TEXT_SIZES.some((t) => t.id === s.text) ? (s.text as TextSize) : 'normal',
      }
    }
  } catch { /* fall through */ }
  return DEFAULT_APPEARANCE
}

/** Puts the choices on <html> so the CSS can react to them. Safe to call any number of times. */
export function applyAppearance(a: Appearance = readAppearance(), root: HTMLElement = document.documentElement) {
  root.dataset.accent = a.accent
  root.dataset.text = a.text
}

const listeners = new Set<() => void>()
export function setAppearance(patch: Partial<Appearance>) {
  const next = { ...readAppearance(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* ignore */ }
  applyAppearance(next)
  listeners.forEach((f) => f())
}

export function useAppearance() {
  const [a, setA] = useState(readAppearance)
  useEffect(() => {
    const f = () => setA(readAppearance())
    listeners.add(f)
    window.addEventListener('storage', f)
    return () => { listeners.delete(f); window.removeEventListener('storage', f) }
  }, [])
  return a
}

/** Dark/light theme: App owns the real state; this lets other screens read and request a change. */
export function useTheme() {
  const read = () => document.documentElement.classList.contains('dark')
  const [dark, setDark] = useState(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return { dark, setDark: (d: boolean) => window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: d })) }
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** The accent colours as real colour values, for charts that can't use CSS variables. Updates with the accent and theme. */
export function useAccentColors() {
  const a = useAppearance()
  const { dark } = useTheme()
  const [c, setC] = useState({ accent: '#5b8cff', accent2: '#a78bfa' })
  useEffect(() => {
    // wait a frame so the new data-attribute / class has been applied
    const id = requestAnimationFrame(() => setC({ accent: cssVar('--accent') || '#5b8cff', accent2: cssVar('--accent2') || '#a78bfa' }))
    return () => cancelAnimationFrame(id)
  }, [a.accent, dark])
  return c
}
