export type SettingsTab = 'general' | 'capital' | 'risk' | 'charges' | 'sound' | 'data'
export type SectionId = 'general' | 'appearance' | 'defaults' | 'monthly' | 'risk' | 'checklist' | 'cooldown' | 'charges' | 'sound' | 'backup'

export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'capital', label: 'Capital & goals' },
  { id: 'risk', label: 'Risk & cooldown' },
  { id: 'charges', label: 'Charges' },
  { id: 'sound', label: 'Sound' },
  { id: 'data', label: 'Data' },
]

export const SECTIONS: { id: SectionId; tab: SettingsTab; title: string; keywords: string }[] = [
  { id: 'general', tab: 'general', title: 'General', keywords: 'setups mistake tags exit mistakes labels' },
  { id: 'appearance', tab: 'general', title: 'Appearance', keywords: 'theme dark light accent colour color text size font' },
  { id: 'defaults', tab: 'capital', title: 'Defaults', keywords: 'default trading capital profit goal loss limit' },
  { id: 'monthly', tab: 'capital', title: 'Monthly capital, goal & loss limit', keywords: 'month capital goal override carry forward' },
  { id: 'risk', tab: 'risk', title: 'Risk rules', keywords: 'max trades per day daily loss streak consecutive losses revenge' },
  { id: 'checklist', tab: 'risk', title: 'Pre-trade checklist', keywords: 'questions tick before trade entry stop-loss discipline habit' },
  { id: 'cooldown', tab: 'risk', title: 'Cooldown timer', keywords: 'break minutes stop-loss pause notification chime' },
  { id: 'charges', tab: 'charges', title: 'Charge rates', keywords: 'brokerage stt exchange sebi stamp gst fees dhan' },
  { id: 'sound', tab: 'sound', title: 'Sound & haptics', keywords: 'sound vibrate vibration volume beep toast feedback' },
  { id: 'backup', tab: 'data', title: 'Backup', keywords: 'backup export import restore json csv screenshots lite full auto download storage' },
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9₹% ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Sections matching every word of the query (title, keywords, or tab name). Empty query matches nothing. */
export function searchSettings(query: string): SectionId[] {
  const words = norm(query).split(' ').filter(Boolean)
  if (!words.length) return []
  return SECTIONS.filter((s) => {
    const hay = norm(`${s.title} ${s.keywords} ${SETTINGS_TABS.find((t) => t.id === s.tab)?.label ?? ''}`)
    return words.every((w) => hay.includes(w))
  }).map((s) => s.id)
}
