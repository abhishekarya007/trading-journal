import { describe, it, expect } from 'vitest'
import { nseStatus } from './market'

describe('nseStatus', () => {
  it('uses IST session hours', () => {
    expect(nseStatus(new Date('2026-09-29T04:00:00Z')).open).toBe(true) // Tue 09:30 IST
    expect(nseStatus(new Date('2026-09-29T03:35:00Z')).label).toBe('Pre-open') // 09:05 IST
    expect(nseStatus(new Date('2026-09-29T11:00:00Z')).label).toBe('Closed') // 16:30 IST
    expect(nseStatus(new Date('2026-10-04T05:00:00Z')).label).toBe('Closed · weekend') // Sunday
  })
})
