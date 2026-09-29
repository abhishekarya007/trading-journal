import { describe, it, expect } from 'vitest'
import { addDays, weekStart, weekDays } from './week'

describe('week helpers', () => {
  it('finds Monday for any day of the week', () => {
    expect(weekStart('2026-09-28')).toBe('2026-09-28') // Monday
    expect(weekStart('2026-09-29')).toBe('2026-09-28') // Tuesday
    expect(weekStart('2026-10-04')).toBe('2026-09-28') // Sunday
  })
  it('adds days across month/year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('lists 7 days from Monday', () => {
    const d = weekDays('2026-09-28')
    expect(d).toHaveLength(7)
    expect(d[6]).toBe('2026-10-04')
  })
})
