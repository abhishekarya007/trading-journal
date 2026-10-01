import { useEffect, useState } from 'react'
import type { Settings } from './types'
import { exportJson } from './db'

const K = { at: 'tj-last-backup', count: 'tj-last-backup-count', auto: 'tj-auto-backup', snooze: 'tj-backup-snooze' }
export const DAY = 86_400_000

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode etc. */ } }

export interface BackupInfo {
  at: number | null // when the last backup was made
  count: number // how many trades it contained
  auto: boolean // download a backup automatically when one is due
  snoozedUntil: number
}

export function readBackupInfo(): BackupInfo {
  const at = Number(read(K.at))
  return {
    at: Number.isFinite(at) && at > 0 ? at : null,
    count: Number(read(K.count)) || 0,
    auto: read(K.auto) === '1',
    snoozedUntil: Number(read(K.snooze)) || 0,
  }
}

export type BackupState = 'empty' | 'never' | 'ok' | 'due' | 'overdue'
export const DUE_AFTER_DAYS = 7
export const OVERDUE_AFTER_DAYS = 14
const MANY_NEW_TRADES = 25

/** Is it time to back up? Time since the last backup, or a lot of unsaved trades, makes it due. */
export function backupStatus(tradeCount: number, info: Pick<BackupInfo, 'at' | 'count'>, now: number) {
  const newSince = Math.max(0, tradeCount - info.count)
  if (tradeCount === 0) return { state: 'empty' as BackupState, days: null as number | null, newSince }
  if (info.at === null) return { state: 'never' as BackupState, days: null, newSince }
  const days = Math.max(0, Math.floor((now - info.at) / DAY))
  const state: BackupState = days >= OVERDUE_AFTER_DAYS ? 'overdue' : days >= DUE_AFTER_DAYS || newSince >= MANY_NEW_TRADES ? 'due' : 'ok'
  return { state, days, newSince }
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((f) => f())

/** Live view of the backup info; updates when a backup is made or a setting changes (also across tabs). */
export function useBackupInfo() {
  const [info, setInfo] = useState(readBackupInfo)
  useEffect(() => {
    const f = () => setInfo(readBackupInfo())
    listeners.add(f)
    window.addEventListener('storage', f)
    return () => { listeners.delete(f); window.removeEventListener('storage', f) }
  }, [])
  return info
}

export function setAutoBackup(on: boolean) { write(K.auto, on ? '1' : '0'); notify() }
export function snoozeBackup(days = 2, now = Date.now()) { write(K.snooze, String(now + days * DAY)); notify() }

/** Saves everything (trades, reviews, settings) as a JSON file download and records that a backup was made. */
export async function downloadBackup(settings: Settings, tradeCount: number, now = Date.now()): Promise<string> {
  const text = await exportJson(settings)
  const stamp = new Date(now)
  const name = `trading-journal-${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')}.json`
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  write(K.at, String(now))
  write(K.count, String(tradeCount))
  write(K.snooze, '0')
  notify()
  return name
}

export const agoText = (days: number | null) =>
  days === null ? 'never' : days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`

/** Asks the browser not to evict this site's data when disk space is low. */
export async function storageProtected(): Promise<boolean | null> {
  try { return (await navigator.storage?.persisted?.()) ?? null } catch { return null }
}
export async function requestStorageProtection(): Promise<boolean> {
  try { return (await navigator.storage?.persist?.()) ?? false } catch { return false }
}
