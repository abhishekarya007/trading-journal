import { describe, expect, it } from 'vitest'
import { ACCENTS, applyAppearance, DEFAULT_APPEARANCE } from './appearance'
import { searchSettings, SECTIONS } from './settingsSearch'

describe('appearance', () => {
  it('writes the choices onto the root element', () => {
    const root = { dataset: {} as Record<string, string> } as unknown as HTMLElement
    applyAppearance({ accent: 'teal', text: 'large' }, root)
    expect(root.dataset).toEqual({ accent: 'teal', text: 'large' })
    applyAppearance(DEFAULT_APPEARANCE, root)
    expect(root.dataset.accent).toBe('blue')
  })
  it('has unique accent ids', () => {
    expect(new Set(ACCENTS.map((a) => a.id)).size).toBe(ACCENTS.length)
  })
})

describe('settings search', () => {
  it('finds sections by keyword, requiring every word', () => {
    expect(searchSettings('brokerage')).toEqual(['charges'])
    expect(searchSettings('loss limit')).toContain('defaults')
    expect(searchSettings('vibrate volume')).toEqual(['sound'])
    expect(searchSettings('brokerage banana')).toEqual([])
  })
  it('is empty for blank queries and covers every section id once', () => {
    expect(searchSettings('  ')).toEqual([])
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length)
  })
})
