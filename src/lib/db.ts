import Dexie, { type Table } from 'dexie'
import { useEffect, useState, useCallback } from 'react'
import type { Settings, Trade, WeeklyReview } from './types'
import { DEFAULT_SETTINGS } from './defaults'
import { normalizeSettings, parseBackup, newTrades, mergeReviews, type ParsedBackup } from './backupMerge'

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
      return normalizeSettings(JSON.parse(raw))
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

/** Replaces EVERYTHING (trades, reviews, settings) with the backup. Also used to undo an import. */
export async function importJson(text: string): Promise<{ settings: Settings; count: number }> {
  const parsed = parseBackup(text)
  await db.trades.clear()
  await db.trades.bulkAdd(parsed.trades)
  await db.reviews.clear()
  if (parsed.reviews.length) await db.reviews.bulkPut(parsed.reviews)
  return { settings: normalizeSettings(parsed.settings), count: parsed.trades.length }
}

/** Adds the backup's trades and reviews to what is already here, skipping trades you already have. */
export async function mergeBackup(parsed: ParsedBackup): Promise<{ added: number; skipped: number; reviewsAdded: number; reviewsFilled: number }> {
  const { add, skipped } = newTrades(await db.trades.toArray(), parsed.trades)
  if (add.length) await db.trades.bulkAdd(add)
  const r = mergeReviews(await db.reviews.toArray(), parsed.reviews)
  if (r.put.length) await db.reviews.bulkPut(r.put)
  return { added: add.length, skipped, reviewsAdded: r.added, reviewsFilled: r.filled }
}
