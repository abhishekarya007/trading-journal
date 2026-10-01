import { useState } from 'react'
import type { Settings } from '../lib/types'
import type { Row } from '../lib/stats'
import { autoChecks, checklistWarnings } from '../lib/checklist'
import { useCooldown } from '../lib/cooldown'
import { localDate } from '../lib/week'
import Modal from './Modal'

interface Props { rows: Row[]; settings: Settings; onClose: () => void; onAddTrade: () => void }

/** A quick look before you trade: what the app already knows, then your own questions to tick. Nothing is saved. */
export default function ChecklistModal({ rows, settings, onClose, onAddTrade }: Props) {
  const items = settings.checklist.items
  const [ticked, setTicked] = useState<boolean[]>(() => items.map(() => false))
  const cooldown = useCooldown()
  const date = localDate()
  const auto = autoChecks(checklistWarnings(rows, settings, date), cooldown.active)
  const problems = auto.filter((a) => !a.ok)
  const count = ticked.filter(Boolean).length
  const ready = items.length > 0 && count === items.length && problems.length === 0

  return (
    <Modal title="Before you trade" size="md" onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn-ghost" onClick={() => setTicked(items.map(() => false))} disabled={count === 0}>Clear ticks</button>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
            <button type="button" className="btn" onClick={() => { onClose(); onAddTrade() }}>{ready ? 'All clear, add a trade' : 'Add a trade'} →</button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        {problems.length > 0 && (
          <div role="alert" className="rounded-xl border border-warn/50 bg-warn/10 p-3 text-sm">
            <div className="font-medium">⚠ Pause and read this first</div>
            <ul className="ml-5 mt-1 list-disc">{problems.map((p) => <li key={p.id}>{p.detail}</li>)}</ul>
          </div>
        )}

        <section>
          <h3 className="label">Right now</h3>
          <ul className="divide-y divide-line/60 rounded-xl border border-line bg-panel2/40">
            {auto.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5 px-3.5 py-2 text-sm">
                <span className={`mt-0.5 ${a.ok ? 'text-up' : 'text-warn'}`} aria-hidden="true">{a.ok ? '✓' : '⚠'}</span>
                <span><span className="font-medium">{a.label}</span>{a.ok ? '' : <span className="text-muted"> · {a.detail}</span>}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="label">Before you enter <span className="normal-case tracking-normal text-muted">· {count} of {items.length}</span></h3>
          {items.length === 0 ? <p className="text-sm text-muted">No questions yet. Add some in Settings → Risk &amp; cooldown.</p> : (
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li key={it}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition ${ticked[i] ? 'border-up/50 bg-up/10' : 'border-line hover:border-accent/50'}`}>
                    <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={ticked[i]} data-autofocus={i === 0 ? true : undefined}
                      onChange={() => setTicked((t) => t.map((v, j) => (j === i ? !v : v)))} />
                    {it}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}
