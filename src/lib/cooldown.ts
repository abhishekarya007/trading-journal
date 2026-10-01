import { useEffect, useState } from 'react'

const KEY = 'tj-cooldown'
export const OPEN_EVENT = 'tj-open-cooldown'

export interface Cooldown { startedAt: number; end: number }

const read = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const write = (v: string | null) => { try { if (v === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, v) } catch { /* private mode etc. */ } }

export function readCooldown(): Cooldown | null {
  const raw = read()
  if (!raw) return null
  try {
    const c = JSON.parse(raw) as Cooldown
    return Number.isFinite(c.end) && Number.isFinite(c.startedAt) ? c : null
  } catch { return null }
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((f) => f())

export function startCooldown(minutes: number, now = Date.now()): Cooldown {
  const c = { startedAt: now, end: now + Math.max(1, minutes) * 60_000 }
  write(JSON.stringify(c))
  notify()
  return c
}
export function extendCooldown(minutes: number) {
  const c = readCooldown()
  if (!c) return
  write(JSON.stringify({ ...c, end: c.end + minutes * 60_000 }))
  notify()
}
export function stopCooldown() { write(null); notify() }
export const requestOpenCooldown = () => window.dispatchEvent(new Event(OPEN_EVENT))

export const remainingMs = (c: Cooldown | null, now: number) => (c ? Math.max(0, c.end - now) : 0)

/** 0 to 100: how much of the cooldown has passed. */
export const elapsedPct = (c: Cooldown, now: number) => {
  const total = c.end - c.startedAt
  return total > 0 ? Math.min(100, Math.max(0, ((now - c.startedAt) / total) * 100)) : 100
}

/** 754000 ms -> "12:34"; an hour or more -> "1:02:03". */
export function formatClock(ms: number) {
  const s = Math.ceil(Math.max(0, ms) / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(h ? m : m).padStart(h ? 2 : 1, '0')
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

/** Live cooldown state: updates every second while one is running, and across browser tabs. */
export function useCooldown() {
  const [cd, setCd] = useState(readCooldown)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const f = () => setCd(readCooldown())
    listeners.add(f)
    window.addEventListener('storage', f)
    return () => { listeners.delete(f); window.removeEventListener('storage', f) }
  }, [])
  useEffect(() => {
    if (!cd) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [cd])
  const remaining = remainingMs(cd, now)
  return { cd, now, remaining, active: !!cd && remaining > 0, finished: !!cd && remaining <= 0 }
}

/** A short two-tone chime. Silently does nothing where audio isn't allowed. */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[660, 880].forEach((freq, i) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.22)
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.22 + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.22 + 0.4)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + i * 0.22)
      o.stop(ctx.currentTime + i * 0.22 + 0.45)
    })
    setTimeout(() => void ctx.close(), 1200)
  } catch { /* ignore */ }
}
