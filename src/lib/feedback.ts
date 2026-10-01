import { useEffect, useState } from 'react'

const KEY = 'tj-feedback'

/** success/error/info go with messages; win/loss/goal/limit go with what a saved trade did to your day. */
export type FeedbackKind = 'success' | 'error' | 'info' | 'win' | 'loss' | 'goal' | 'limit'
export type Volume = 'quiet' | 'normal' | 'loud'
export interface Feedback { sound: boolean; haptics: boolean; volume: Volume }
export const DEFAULT_FEEDBACK: Feedback = { sound: true, haptics: true, volume: 'normal' }

export const GAIN: Record<Volume, number> = { quiet: 0.05, normal: 0.11, loud: 0.22 }
/** Vibration lengths in milliseconds: a light tap for success, a double buzz for errors. */
export const VIBRATION: Record<FeedbackKind, number | number[]> = {
  success: 12, info: 8, error: [25, 40, 25],
  win: 14, loss: 18, goal: [12, 40, 12, 40, 24], limit: [35, 50, 35],
}
/** Each kind is a few short notes: success rises, error falls, info is a single soft tick. */
export const NOTES: Record<FeedbackKind, { f: number; at: number; dur: number; type: OscillatorType }[]> = {
  success: [{ f: 587, at: 0, dur: 0.09, type: 'sine' }, { f: 880, at: 0.07, dur: 0.14, type: 'sine' }],
  info: [{ f: 659, at: 0, dur: 0.1, type: 'sine' }],
  error: [{ f: 330, at: 0, dur: 0.11, type: 'triangle' }, { f: 247, at: 0.09, dur: 0.17, type: 'triangle' }],
  // A winning trade: a small rising arpeggio. A losing one: two soft, low notes, deliberately calm rather than an alarm.
  win: [{ f: 523, at: 0, dur: 0.09, type: 'sine' }, { f: 659, at: 0.07, dur: 0.09, type: 'sine' }, { f: 784, at: 0.14, dur: 0.24, type: 'sine' }],
  loss: [{ f: 330, at: 0, dur: 0.15, type: 'triangle' }, { f: 262, at: 0.12, dur: 0.28, type: 'triangle' }],
  // Goal reached: a bright four-note chime. Limit reached: a slow double pulse that gets your attention without shouting.
  goal: [{ f: 784, at: 0, dur: 0.12, type: 'sine' }, { f: 988, at: 0.1, dur: 0.12, type: 'sine' }, { f: 1175, at: 0.2, dur: 0.14, type: 'sine' }, { f: 1568, at: 0.32, dur: 0.4, type: 'sine' }],
  limit: [{ f: 440, at: 0, dur: 0.13, type: 'triangle' }, { f: 440, at: 0.2, dur: 0.13, type: 'triangle' }, { f: 349, at: 0.4, dur: 0.26, type: 'triangle' }],
}

export function readFeedback(): Feedback {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<Feedback>
      return {
        sound: s.sound ?? DEFAULT_FEEDBACK.sound,
        haptics: s.haptics ?? DEFAULT_FEEDBACK.haptics,
        volume: s.volume === 'quiet' || s.volume === 'loud' ? s.volume : 'normal',
      }
    }
  } catch { /* fall through */ }
  return DEFAULT_FEEDBACK
}

const listeners = new Set<() => void>()
export function setFeedback(patch: Partial<Feedback>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...readFeedback(), ...patch })) } catch { /* ignore */ }
  listeners.forEach((f) => f())
}

export function useFeedback() {
  const [fb, setFb] = useState(readFeedback)
  useEffect(() => {
    const f = () => setFb(readFeedback())
    listeners.add(f)
    window.addEventListener('storage', f)
    return () => { listeners.delete(f); window.removeEventListener('storage', f) }
  }, [])
  return fb
}

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  try {
    const Ctx = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!Ctx) return null
    ctx ??= new Ctx()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

export function playSound(kind: FeedbackKind, volume: Volume = readFeedback().volume) {
  const c = audio()
  if (!c) return
  const peak = GAIN[volume]
  for (const n of NOTES[kind]) {
    const o = c.createOscillator()
    const g = c.createGain()
    const t0 = c.currentTime + n.at
    o.type = n.type
    o.frequency.value = n.f
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur)
    o.connect(g).connect(c.destination)
    o.start(t0)
    o.stop(t0 + n.dur + 0.03)
  }
}

export function vibrate(kind: FeedbackKind) {
  try { navigator.vibrate?.(VIBRATION[kind]) } catch { /* not supported */ }
}

/** The little sound and buzz that go with a confirmation message, following your settings. */
export function playFeedback(kind: FeedbackKind) {
  const fb = readFeedback()
  if (fb.sound) playSound(kind, fb.volume)
  if (fb.haptics) vibrate(kind)
}
