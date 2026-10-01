import Dexie, { type Table } from 'dexie'
import { useEffect, useState, useCallback } from 'react'
import type { Settings, Trade, WeeklyReview } from './types'
import { DEFAULT_SETTINGS } from './defaults'

class JournalDB extends Dexie {
  trades!: Table<Trade, number>
  reviews!: Table<WeeklyReview, string>
  constructor() {
    super('trading-journal')
    this.version(1).stores({ trades: '++id, date, symbol, type, setup' })
    this.version(2).stores({ trades: '++id, date, symbol, type, setup', reviews: 'weekStart' })
  }
}
export const db = new JournalDB()

const SETTINGS_KEY = 'tj-settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const s = JSON.parse(raw)
      return { ...DEFAULT_SETTINGS, ...s, rates: { ...DEFAULT_SETTINGS.rates, ...s.rates }, risk: { ...DEFAULT_SETTINGS.risk, ...s.risk }, calculator: { ...DEFAULT_SETTINGS.calculator, ...s.calculator } }
    }
  } catch { /* fall through */ }
  return DEFAULT_SETTINGS
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const save = useCallback((s: Settings) => {
    setSettings(s)
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch { /* ignore */ }
  }, [])
  return [settings, save] as const
}

export function useTrades() {
  const [trades, setTrades] = useState<Trade[] | null>(null)
  const refresh = useCallback(async () => setTrades(await db.trades.toArray()), [])
  useEffect(() => { refresh() }, [refresh])
  return { trades: trades ?? [], loading: trades === null, refresh }
}

export async function exportJson(settings: Settings) {
  const trades = await db.trades.toArray()
  const reviews = await db.reviews.toArray()
  return JSON.stringify({ version: 2, settings, trades, reviews }, null, 2)
}

export async function importJson(text: string): Promise<{ settings: Settings; count: number }> {
  const data = JSON.parse(text)
  if (!Array.isArray(data.trades)) throw new Error('Invalid file: no trades array')
  const trades: Trade[] = data.trades.map(({ id: _id, ...t }: Trade) => t)
  await db.trades.clear()
  await db.trades.bulkAdd(trades)
  await db.reviews.clear()
  if (Array.isArray(data.reviews)) await db.reviews.bulkPut(data.reviews)
  const st = data.settings ?? {}
  return {
    settings: { ...DEFAULT_SETTINGS, ...st, rates: { ...DEFAULT_SETTINGS.rates, ...st.rates }, risk: { ...DEFAULT_SETTINGS.risk, ...st.risk }, calculator: { ...DEFAULT_SETTINGS.calculator, ...st.calculator } },
    count: trades.length,
  }
}
