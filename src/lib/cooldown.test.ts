import { describe, it, expect, beforeEach } from 'vitest'
import { elapsedPct, extendCooldown, formatClock, readCooldown, remainingMs, startCooldown, stopCooldown } from './cooldown'

// A minimal localStorage for the node test environment.
const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(), key: () => null, length: 0,
} as Storage
beforeEach(() => mem.clear())

describe('formatClock', () => {
  it('shows minutes and seconds, rounding partial seconds up so it never shows 0:00 early', () => {
    expect(formatClock(15 * 60_000)).toBe('15:00')
    expect(formatClock(754_000)).toBe('12:34')
    expect(formatClock(59_001)).toBe('1:00')
    expect(formatClock(1)).toBe('0:01')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-5000)).toBe('0:00')
    expect(formatClock(65 * 60_000 + 3000)).toBe('1:05:03')
  })
})

describe('cooldown storage', () => {
  it('starts, reads, extends and stops', () => {
    expect(readCooldown()).toBeNull()
    const c = startCooldown(15, 1_000_000)
    expect(c).toEqual({ startedAt: 1_000_000, end: 1_000_000 + 900_000 })
    expect(readCooldown()).toEqual(c)
    extendCooldown(5)
    expect(readCooldown()!.end).toBe(1_000_000 + 1_200_000)
    stopCooldown()
    expect(readCooldown()).toBeNull()
    extendCooldown(5) // nothing running: no-op
    expect(readCooldown()).toBeNull()
  })
  it('never starts shorter than a minute and ignores corrupt data', () => {
    expect(startCooldown(0, 0).end).toBe(60_000)
    mem.set('tj-cooldown', 'not json')
    expect(readCooldown()).toBeNull()
    mem.set('tj-cooldown', JSON.stringify({ end: 'x' }))
    expect(readCooldown()).toBeNull()
  })
})

describe('remaining and progress', () => {
  const c = { startedAt: 0, end: 600_000 }
  it('counts down to zero and never goes negative', () => {
    expect(remainingMs(c, 0)).toBe(600_000)
    expect(remainingMs(c, 450_000)).toBe(150_000)
    expect(remainingMs(c, 900_000)).toBe(0)
    expect(remainingMs(null, 0)).toBe(0)
  })
  it('reports how far through it is, between 0 and 100', () => {
    expect(elapsedPct(c, 0)).toBe(0)
    expect(elapsedPct(c, 300_000)).toBe(50)
    expect(elapsedPct(c, 5_000_000)).toBe(100)
    expect(elapsedPct(c, -100)).toBe(0)
  })
})
