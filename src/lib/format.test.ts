import { describe, expect, it } from 'vitest'
import { hour12, minutes12, time12 } from './format'

describe('12-hour time', () => {
  it('converts 24-hour times, padded or not', () => {
    expect(time12('09:15')).toBe('9:15 AM')
    expect(time12('9:15')).toBe('9:15 AM')
    expect(time12('13:05')).toBe('1:05 PM')
    expect(time12('15:30')).toBe('3:30 PM')
  })
  it('handles noon and midnight correctly', () => {
    expect(time12('12:00')).toBe('12:00 PM')
    expect(time12('12:45')).toBe('12:45 PM')
    expect(time12('00:10')).toBe('12:10 AM')
    expect(time12('0:10')).toBe('12:10 AM')
    expect(time12('23:59')).toBe('11:59 PM')
  })
  it('returns empty for no time and leaves non-times alone', () => {
    expect(time12(undefined)).toBe('')
    expect(time12('')).toBe('')
    expect(time12('soon')).toBe('soon')
  })
  it('formats minutes and hours', () => {
    expect(minutes12(10 * 60 + 59.6)).toBe('11:00 AM')
    expect(minutes12(13 * 60 + 5)).toBe('1:05 PM')
    expect(hour12(9)).toBe('9 AM')
    expect(hour12(12)).toBe('12 PM')
    expect(hour12(0)).toBe('12 AM')
    expect(hour12(15)).toBe('3 PM')
  })
})
