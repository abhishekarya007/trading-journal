import { useState } from 'react'
import type { Settings } from '../lib/types'
import { agoText, backupStatus, downloadBackup, useBackupInfo, type BackupState } from '../lib/backup'
import { toast } from '../lib/toast'

const DOT: Record<BackupState, string> = { empty: 'bg-muted/50', never: 'bg-down', ok: 'bg-up', due: 'bg-warn', overdue: 'bg-down' }

/** Small status card for the sidebar: how fresh your last backup is, with a one-click backup. */
export default function BackupBadge({ count, settings }: { count: number; settings: Settings }) {
  const info = useBackupInfo()
  const [busy, setBusy] = useState(false)
  const st = backupStatus(count, info, Date.now())

  const run = async () => {
    setBusy(true)
    try { const name = await downloadBackup(settings, count); toast(`Backup saved: ${name}`) } catch { toast('Backup failed', 'error') }
    setBusy(false)
  }

  const headline = st.state === 'empty' ? 'Backup' : st.state === 'never' ? 'Not backed up yet' : `Backed up ${agoText(st.days)}`
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-panel2/50 px-3 py-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[st.state]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-xs font-medium">{headline}</div>
        <div className="truncate text-[11px] text-muted">
          {st.state === 'empty' ? 'Nothing to back up yet' : st.newSince > 0 ? `${st.newSince} trade${st.newSince === 1 ? '' : 's'} not saved` : 'Everything is saved'}
        </div>
      </div>
      {st.state !== 'empty' && (
        <button type="button" className="btn-ghost !px-2 !py-1 text-[11px]" onClick={run} disabled={busy} title="Download a backup file of all your data">
          {busy ? '…' : 'Back up'}
        </button>
      )}
    </div>
  )
}
