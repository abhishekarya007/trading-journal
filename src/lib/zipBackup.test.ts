import { describe, expect, it } from 'vitest'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { bytesToDataUrl, dataUrlToFile, jsonToZip, readBackupFile, zipToJson } from './zipBackup'
import { parseBackup } from './backupMerge'

// A real 1x1 PNG and a tiny fake "JPEG" payload.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const JPG = bytesToDataUrl(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 250, 251, 0xff, 0xd9]), 'jpg')
const trade = (symbol: string, screenshots?: string[]) => ({ date: '2026-10-01', symbol, side: 'Long', qty: 10, entryPrice: 100, exitPrice: 105, setup: 'Gap', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '', screenshots })
const backup = (trades: unknown[]) => JSON.stringify({ version: 2, screenshots: true, settings: { startingCapital: 5 }, trades, reviews: [{ weekStart: '2026-09-28', wentWell: 'a', improve: 'b', focus: 'c' }] })

describe('data URLs', () => {
  it('round-trips bytes and rejects things that are not images', () => {
    const f = dataUrlToFile(JPG)!
    expect(f.ext).toBe('jpg')
    expect(Array.from(f.bytes)).toEqual([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 250, 251, 0xff, 0xd9])
    expect(bytesToDataUrl(f.bytes, 'jpg')).toBe(JPG)
    expect(dataUrlToFile('https://example.com/a.png')).toBeNull()
    expect(dataUrlToFile('data:text/plain;base64,AAAA')).toBeNull()
  })
})

describe('ZIP backup', () => {
  it('stores screenshots as image files and keeps data.json small', () => {
    const zip = jsonToZip(backup([trade('TCS', [PNG, JPG]), trade('INFY')]))
    const files = unzipSync(zip)
    const names = Object.keys(files).sort()
    expect(names).toContain('data.json')
    expect(names).toContain('README.txt')
    expect(names.filter((n) => n.startsWith('screenshots/'))).toHaveLength(2)
    expect(names.some((n) => n.endsWith('_TCS_1.png'))).toBe(true)
    const data = JSON.parse(new TextDecoder().decode(files['data.json']))
    expect(data.trades[0].screenshots[0]).toMatch(/^screenshots\/0001_2026-10-01_TCS_1\.png$/)
    expect(new TextDecoder().decode(files['data.json'])).not.toContain('base64')
  })

  it('restores exactly what was saved, and parseBackup accepts the result', () => {
    const original = backup([trade('TCS', [PNG, JPG]), trade('INFY')])
    const back = zipToJson(jsonToZip(original))
    const a = JSON.parse(original)
    const b = JSON.parse(back)
    expect(b.trades[0].screenshots).toEqual(a.trades[0].screenshots)
    expect(b.reviews).toEqual(a.reviews)
    expect(b.settings).toEqual(a.settings)
    const parsed = parseBackup(back)
    expect(parsed.trades).toHaveLength(2)
    expect(parsed.screenshotCount).toBe(2)
    expect(parsed.reviews).toHaveLength(1)
  })

  it('handles a lite backup (no screenshots) and trades with no images', () => {
    const lite = JSON.stringify({ version: 2, screenshots: false, settings: {}, trades: [trade('TCS')], reviews: [] })
    const back = JSON.parse(zipToJson(jsonToZip(lite)))
    expect(back.screenshots).toBe(false)
    expect(back.trades).toHaveLength(1)
  })

  it('skips an image file that is missing instead of failing', () => {
    const zip = zipSync({ 'data.json': strToU8(JSON.stringify({ trades: [{ ...trade('TCS'), screenshots: ['screenshots/gone.jpg'] }] })) })
    expect(JSON.parse(zipToJson(zip)).trades[0].screenshots).toEqual([])
  })

  it('still works if the zip was re-zipped inside a folder', () => {
    const inner = unzipSync(jsonToZip(backup([trade('TCS', [PNG])])))
    const nested = zipSync(Object.fromEntries(Object.entries(inner).map(([k, v]) => ['backup/' + k, v])))
    expect(parseBackup(zipToJson(nested)).screenshotCount).toBe(1)
  })

  it('gives clear errors for a non-zip, or a zip without data.json', () => {
    expect(() => zipToJson(new Uint8Array([1, 2, 3, 4]))).toThrow(/could not be opened/)
    expect(() => zipToJson(zipSync({ 'notes.txt': strToU8('hi') }))).toThrow(/no data\.json/)
  })

  it('readBackupFile opens both .zip and .json files by what they contain, not their name', async () => {
    const original = backup([trade('TCS', [PNG])])
    const zipFile = new File([jsonToZip(original).slice().buffer as ArrayBuffer], 'backup.dat')
    const jsonFile = new File([original], 'backup.zip')
    expect(parseBackup(await readBackupFile(zipFile)).screenshotCount).toBe(1)
    expect(parseBackup(await readBackupFile(jsonFile)).screenshotCount).toBe(1)
  })
})
