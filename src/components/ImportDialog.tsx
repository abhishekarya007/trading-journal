import { useMemo, useState } from 'react'
import type { Trade, WeeklyReview } from '../lib/types'
import { mergeReviews, newTrades, screenshotStats, type ParsedBackup } from '../lib/backupMerge'
import Modal from './Modal'

export type ImportMode = 'merge' | 'replace'

interface Props {
  parsed: ParsedBackup
  existing: Trade[] // what is in the journal now
  existingReviews: WeeklyReview[]
  fileName: string
  onConfirm: (mode: ImportMode) => void
  onCancel: () => void
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Shows what a backup file contains and lets you choose how to bring it in. Adding is the default. */
export default function ImportDialog({ parsed, existing, existingReviews, fileName, onConfirm, onCancel }: Props) {
  const [mode, setMode] = useState<ImportMode>('merge')
  const plan = useMemo(() => newTrades(existing, parsed.trades), [existing, parsed.trades])
  const reviews = useMemo(() => mergeReviews(existingReviews, parsed.reviews), [existingReviews, parsed.reviews])
  const reviewChanges = reviews.added + reviews.filled
  const myShots = useMemo(() => screenshotStats(existing).images, [existing])
  const losesShots = parsed.screenshotCount === 0 && myShots > 0
  const nothingNew = plan.add.length === 0 && reviews.put.length === 0

  const Option = ({ id, title, tag, children }: { id: ImportMode; title: string; tag?: string; children: React.ReactNode }) => (
    <button type="button" role="radio" aria-checked={mode === id} onClick={() => setMode(id)}
      className={`w-full rounded-xl border p-3.5 text-left transition ${mode === id ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/50'}`}>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${mode === id ? 'border-accent' : 'border-line'}`}>{mode === id && <span className="h-2 w-2 rounded-full bg-accent" />}</span>
        <span className="font-semibold">{title}</span>
        {tag && <span className="rounded-full bg-up/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-up">{tag}</span>}
      </div>
      <div className="mt-1.5 pl-[1.65rem] text-xs leading-relaxed text-muted">{children}</div>
    </button>
  )

  return (
    <Modal title="Restore from a backup" size="md" onClose={onCancel} closeOnBackdrop={false}>
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-panel2/40 p-3.5 text-sm">
          <div className="truncate font-medium">{fileName}</div>
          <p className="mt-1 text-xs text-muted">
            {plural(parsed.trades.length, 'trade')}, {plural(parsed.reviews.length, 'weekly review')}, {parsed.screenshotCount > 0 ? plural(parsed.screenshotCount, 'screenshot') : parsed.lite ? 'no screenshots (a lite backup)' : 'no screenshots'}
            {parsed.invalid > 0 && <> · <span className="text-warn">{plural(parsed.invalid, 'unreadable trade')} will be skipped</span></>}
          </p>
        </div>

        <div role="radiogroup" aria-label="How to restore" className="space-y-2.5">
          <Option id="merge" title="Add to my existing trades" tag="Recommended">
            <b className="text-fg">{plural(plan.add.length, 'new trade')}</b> will be added
            {plan.skipped > 0 && <>, and <b className="text-fg">{plan.skipped}</b> you already have will be skipped</>}.
            {reviewChanges > 0 && <> {plural(reviewChanges, 'weekly review')} will be added or completed (anything you wrote is kept).</>}
            {' '}Your current {plural(existing.length, 'trade')}, weekly reviews and settings stay as they are.
            {nothingNew && <span className="mt-1 block text-warn">Everything in this file is already in your journal.</span>}
          </Option>
          <Option id="replace" title="Replace everything">
            Removes your current {plural(existing.length, 'trade')}, weekly reviews and settings first, then loads the file. Use this to set up a new computer or to go back to an earlier state.
            {losesShots && <span className="mt-1 block font-medium text-warn">⚠ This file has no screenshots, so your {plural(myShots, 'current screenshot')} would be removed. Choose Add instead to keep them.</span>}
          </Option>
        </div>

        <p className="text-xs text-muted">Either way, you can press <b className="text-fg">Undo</b> right after to put things back.</p>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={mode === 'replace' ? 'btn-ghost !border-down/60 !text-down' : 'btn'} onClick={() => onConfirm(mode)} disabled={mode === 'merge' && nothingNew}>
            {mode === 'merge' ? (plan.add.length > 0 || reviewChanges === 0 ? `Add ${plural(plan.add.length, 'trade')}` : 'Add weekly reviews') : 'Replace everything'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
