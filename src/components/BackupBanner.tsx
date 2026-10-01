import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Settings } from '../lib/types'
import { agoText, backupStatus, downloadBackup, snoozeBackup, useBackupInfo } from '../lib/backup'
import { toast } from '../lib/toast'

/** Dashboard reminder that appears only when a backup is due. */
export default function BackupBanner({ count, settings }: { count: number; settings: Settings }) {
  const info = useBackupInfo()
  const [busy, setBusy] = useState(false)
  const st = backupStatus(count, info, Date.now())
  if (st.state === 'empty' || st.state === 'ok' || count < 3 || info.snoozedUntil > Date.now()) return null

  const run = async () => {
    setBusy(true)
    try { const name = await downloadBackup(settings, count); toast(`Backup saved: ${name}`) } catch { toast('Backup failed', 'error') }
    setBusy(false)
  }
  const bad = st.state === 'never' || st.state === 'overdue'
  return (
    <div role="alert" className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5 text-sm ${bad ? 'border-down/50 bg-down/10' : 'border-warn/50 bg-warn/10'}`}>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{st.state === 'never' ? 'Your journal has never been backed up' : `Last backup: ${agoText(st.days)}`}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          Your trades live only in this browser, so clearing site data or switching computer would erase them.
          {st.newSince > 0 && <> {st.newSince} trade{st.newSince === 1 ? ' is' : 's are'} not in any backup.</>}
          {' '}Keep the downloaded file somewhere safe, such as Google Drive. <Link to="/settings" className="text-accent hover:underline">Backup settings</Link>
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" className="btn-ghost text-xs" onClick={() => snoozeBackup(2)}>Remind me in 2 days</button>
        <button type="button" className="btn text-xs" onClick={run} disabled={busy}>{busy ? 'Saving…' : 'Back up now'}</button>
      </div>
    </div>
  )
}
