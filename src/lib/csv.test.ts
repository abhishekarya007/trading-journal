import { describe, it, expect } from 'vitest'
import { tradesToCsv } from './csv'
import { calcTrade } from './calc'
import { DEFAULT_SETTINGS } from './defaults'
import type { Trade } from './types'

const t: Trade = {
  id: 1, date: '2026-09-29', symbol: 'TCS', side: 'Long', qty: 30, entryPrice: 137, exitPrice: 139.74, stopLoss: 135.63, target: 141.11,
  entryTime: '10:17', exitTime: '11:16', setup: 'Pullback', emotion: 'Calm', confidence: 4, followedPlan: false, mistakes: ['FOMO', 'Moved SL'],
  notes: 'Chased, then "froze", wrote a comma, and a\nnew line', screenshots: ['data:image/jpeg;base64,xx'],
}
const row = (trade: Trade) => ({ trade, res: calcTrade(trade, DEFAULT_SETTINGS.rates) })

describe('tradesToCsv', () => {
  const parse = (csv: string) => csv.replace(/^﻿/, '').split('\r\n')
  it('starts with a BOM, has a header row, and one line per trade ending in CRLF', () => {
    const csv = tradesToCsv([row(t), row({ ...t, id: 2, notes: '', mistakes: [] })])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(parse(csv)[0]).toContain('Date,Symbol,Side,Quantity')
    expect(csv).toContain('Net P&L')
  })
  it('writes numbers raw and the right values', () => {
    const r = row(t)
    const line = tradesToCsv([r]).split('\r\n')[1]
    expect(line.startsWith('2026-09-29,TCS,Long,30,10:17,11:16,137,139.74,135.63,141.11,')).toBe(true)
    expect(line).toContain(`,${r.res.net},`)
    expect(line).toContain(',No,') // followed plan
    expect(line).toContain('FOMO; Moved SL')
  })
  it('quotes commas, quotes and new lines, and never includes screenshots', () => {
    const csv = tradesToCsv([row(t)])
    expect(csv).toContain('"Chased, then ""froze"", wrote a comma, and a\nnew line"')
    expect(csv).not.toContain('base64')
  })
  it('blocks spreadsheet formulas in text cells but leaves negative numbers alone', () => {
    const bad = row({ ...t, symbol: '=HYPERLINK("http://x")', notes: '+1 cmd', setup: '-x', emotion: '@home', exitPrice: 130, mistakes: ['=bad'] })
    const csv = tradesToCsv([bad])
    expect(csv).toContain(`'=HYPERLINK`)
    expect(csv).toContain(`'+1 cmd`)
    expect(csv).toContain(`,'-x,`)
    expect(csv).toContain(`'@home`)
    expect(csv).toContain(`'=bad`)
    expect(bad.res.net).toBeLessThan(0)
    expect(csv).toContain(`,${bad.res.net},`) // the loss is a plain number, not prefixed
  })
  it('handles optional fields being empty', () => {
    const line = tradesToCsv([row({ ...t, stopLoss: undefined, target: undefined, entryTime: undefined, exitTime: undefined, confidence: undefined })]).split('\r\n')[1]
    expect(line.startsWith('2026-09-29,TCS,Long,30,,,137,139.74,,,')).toBe(true)
  })
})
