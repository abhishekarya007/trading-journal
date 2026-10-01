import { describe, it, expect, beforeEach, vi } from 'vitest'

const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: () => null, length: 0,
} as Storage

import { DEFAULT_FEEDBACK, GAIN, NOTES, VIBRATION, playFeedback, readFeedback, setFeedback } from './feedback'

beforeEach(() => { mem.clear(); vi.restoreAllMocks() })

describe('feedback preferences', () => {
  it('defaults to sound and haptics on at normal volume', () => {
    expect(readFeedback()).toEqual(DEFAULT_FEEDBACK)
    expect(DEFAULT_FEEDBACK).toEqual({ sound: true, haptics: true, volume: 'normal' })
  })
  it('saves changes and keeps the rest', () => {
    setFeedback({ sound: false })
    expect(readFeedback()).toEqual({ sound: false, haptics: true, volume: 'normal' })
    setFeedback({ volume: 'quiet' })
    expect(readFeedback()).toEqual({ sound: false, haptics: true, volume: 'quiet' })
  })
  it('ignores corrupt or unknown stored values', () => {
    mem.set('tj-feedback', 'not json')
    expect(readFeedback()).toEqual(DEFAULT_FEEDBACK)
    mem.set('tj-feedback', JSON.stringify({ volume: 'deafening', sound: 'yes' }))
    expect(readFeedback().volume).toBe('normal')
  })
})

describe('feedback design', () => {
  it('every kind has notes and a vibration, and volumes are in order and gentle', () => {
    for (const k of ['success', 'error', 'info'] as const) {
      expect(NOTES[k].length).toBeGreaterThan(0)
      expect(VIBRATION[k]).toBeDefined()
    }
    expect(GAIN.quiet).toBeLessThan(GAIN.normal)
    expect(GAIN.normal).toBeLessThan(GAIN.loud)
    expect(GAIN.loud).toBeLessThanOrEqual(0.3)
    // success rises, error falls
    expect(NOTES.success[1].f).toBeGreaterThan(NOTES.success[0].f)
    expect(NOTES.error[1].f).toBeLessThan(NOTES.error[0].f)
    expect(Array.isArray(VIBRATION.error)).toBe(true)
  })
})

describe('playFeedback', () => {
  it('vibrates when haptics are on and the device supports it, and is silent about missing audio', () => {
    const vibrate = vi.fn()
    ;(globalThis as unknown as { navigator: unknown }).navigator = { vibrate }
    playFeedback('success') // no AudioContext in node: must not throw
    expect(vibrate).toHaveBeenCalledWith(VIBRATION.success)
    playFeedback('error')
    expect(vibrate).toHaveBeenLastCalledWith(VIBRATION.error)
  })
  it('does nothing for a switched-off kind of feedback, and survives devices without vibration', () => {
    const vibrate = vi.fn()
    ;(globalThis as unknown as { navigator: unknown }).navigator = { vibrate }
    setFeedback({ haptics: false })
    playFeedback('success')
    expect(vibrate).not.toHaveBeenCalled()
    setFeedback({ haptics: true })
    ;(globalThis as unknown as { navigator: unknown }).navigator = {}
    expect(() => playFeedback('info')).not.toThrow()
  })
})
