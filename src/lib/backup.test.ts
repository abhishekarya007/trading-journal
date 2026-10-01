import { describe, it, expect } from 'vitest'
import { backupStatus, agoText, DAY } from './backup'

const NOW = Date.UTC(2026, 9, 1, 12)
const at = (daysAgo: number) => NOW - daysAgo * DAY - 3600_000

describe('backupStatus', () => {
  it('needs no backup when there are no trades', () => {
    expect(backupStatus(0, { at: null, count: 0 }, NOW).state).toBe('empty')
  })
  it('flags a journal that was never backed up', () => {
    expect(backupStatus(10, { at: null, count: 0 }, NOW)).toMatchObject({ state: 'never', days: null, newSince: 10 })
  })
  it('is ok for a week, due after 7 days and overdue after 14', () => {
    expect(backupStatus(10, { at: at(0), count: 10 }, NOW)).toMatchObject({ state: 'ok', days: 0 })
    expect(backupStatus(10, { at: at(6), count: 10 }, NOW).state).toBe('ok')
    expect(backupStatus(10, { at: at(7), count: 10 }, NOW)).toMatchObject({ state: 'due', days: 7 })
    expect(backupStatus(10, { at: at(13), count: 10 }, NOW).state).toBe('due')
    expect(backupStatus(10, { at: at(14), count: 10 }, NOW).state).toBe('overdue')
  })
  it('counts trades added since the backup, and becomes due once there are many', () => {
    expect(backupStatus(15, { at: at(1), count: 10 }, NOW)).toMatchObject({ state: 'ok', newSince: 5 })
    expect(backupStatus(40, { at: at(1), count: 10 }, NOW)).toMatchObject({ state: 'due', newSince: 30 })
    expect(backupStatus(5, { at: at(1), count: 10 }, NOW).newSince).toBe(0) // deleted trades don't count
  })
  it('words the age plainly', () => {
    expect(agoText(null)).toBe('never')
    expect(agoText(0)).toBe('today')
    expect(agoText(1)).toBe('yesterday')
    expect(agoText(9)).toBe('9 days ago')
  })
})
