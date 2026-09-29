import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dismissToast, subscribeToasts, toast, type ToastItem } from './toast'
import { tips } from './glossary'

describe('toast', () => {
  let latest: ToastItem[] = []
  let off: () => void
  beforeEach(() => { vi.useFakeTimers(); latest = []; off = subscribeToasts((t) => { latest = t }) })
  afterEach(() => { off(); vi.useRealTimers() })

  it('plain toasts disappear after a few seconds, ones with an action stay longer', () => {
    toast('saved')
    const run = vi.fn()
    toast('deleted', 'info', { action: { label: 'Undo', run } })
    expect(latest.map((t) => t.text)).toEqual(['saved', 'deleted'])
    vi.advanceTimersByTime(3000)
    expect(latest.map((t) => t.text)).toEqual(['deleted'])
    expect(latest[0].action?.label).toBe('Undo')
    vi.advanceTimersByTime(4500)
    expect(latest).toEqual([])
  })
  it('can be dismissed early and keeps at most four', () => {
    const id = toast('a')
    dismissToast(id)
    expect(latest).toEqual([])
    for (let i = 0; i < 6; i++) toast(`t${i}`)
    expect(latest).toHaveLength(4)
    vi.runAllTimers()
  })
})

describe('glossary', () => {
  it('uses your own numbers in the explanations', () => {
    expect(tips.profitFactor(1.31).text).toContain('1.31')
    expect(tips.profitFactor(Infinity).text).toContain('no losing trades')
    expect(tips.expectancy(24).text).toContain('+₹24')
    expect(tips.maxDrawdown(749).text).toContain('₹749')
    expect(tips.winRate(61.8, 21, 13).text).toContain('21 of 34')
    expect(tips.payoff(0.81, 55.3).text).toContain('55.3%')
    expect(tips.payoff(null, null).title).toContain('Payoff')
    expect(tips.sizeVariation(0.54).text).toContain('54%')
  })
})
