import { describe, it, expect } from 'vitest'
import { monthlyCapital } from './capital'
import type { Row } from './stats'

const row = (date: string, net: number): Row => ({ trade: { date } as Row['trade'], res: { net } as Row['res'] })
const base = { startingCapital: 100000, monthCapital: {} as Record<string, number> }

describe('monthlyCapital', () => {
  it('measures each month against its own fixed amount, never rolling profits forward', () => {
    const m = monthlyCapital([row('2026-08-05', 5000), row('2026-08-06', -1000), row('2026-09-02', 2000)], base, '2026-09')
    expect(m.get('2026-08')).toMatchObject({ capital: 100000, net: 4000, returnPct: 4 })
    // September is NOT 104000: August's profit does not become September's capital
    expect(m.get('2026-09')).toMatchObject({ capital: 100000, net: 2000, returnPct: 2, overridden: false })
  })
  it('uses the amount typed for a month and reuses it for later months', () => {
    const m = monthlyCapital(
      [row('2026-08-05', 4000), row('2026-09-02', 3000), row('2026-10-02', 3000)],
      { ...base, monthCapital: { '2026-09': 200000 } }, '2026-10')
    expect(m.get('2026-08')!.capital).toBe(100000)
    expect(m.get('2026-09')).toMatchObject({ capital: 200000, overridden: true })
    expect(m.get('2026-09')!.returnPct).toBeCloseTo(1.5, 5)
    expect(m.get('2026-10')).toMatchObject({ capital: 200000, overridden: false }) // carried-forward amount, not balance
  })
  it('lets a month use less capital than the one before', () => {
    const m = monthlyCapital([row('2026-08-05', 1000), row('2026-09-02', 1000)], { ...base, monthCapital: { '2026-09': 50000 } }, '2026-09')
    expect(m.get('2026-09')!.returnPct).toBe(2)
  })
  it('fills months without trades, includes the current month, and guards zero capital', () => {
    const m = monthlyCapital([row('2026-06-10', 1000), row('2026-09-02', 500)], base, '2026-09')
    expect([...m.keys()]).toEqual(['2026-06', '2026-07', '2026-08', '2026-09'])
    expect(m.get('2026-07')).toMatchObject({ capital: 100000, net: 0, trades: 0 })
    const z = monthlyCapital([row('2026-09-01', 10)], { startingCapital: 0, monthCapital: {} }, '2026-09')
    expect(z.get('2026-09')!.returnPct).toBe(0)
  })
})
