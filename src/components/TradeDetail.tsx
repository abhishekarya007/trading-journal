import { useEffect, useState } from 'react'
import type { Settings, Trade } from '../lib/types'
import type { Row } from '../lib/stats'
import { adherence, holdMinutes } from '../lib/insights'
import { inr, pct, pnlColor, time12 } from '../lib/format'
import Modal from './Modal'
import SymbolAvatar from './SymbolAvatar'
import { tradeSummary } from '../lib/tradeText'
import { toast } from '../lib/toast'

interface Props {
  row: Row
  settings: Settings
  position: { index: number; total: number }
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onPrev?: () => void
  onNext?: () => void
}

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`)
const price = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Metric({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel2/50 px-3 py-2.5">
      <div className="label !mb-0.5">{label}</div>
      <div className={`num text-sm font-semibold ${className}`}>{value}</div>
    </div>
  )
}

/** Horizontal price ladder: stop-loss, entry, exit and target on one scale. */
function Ladder({ t }: { t: Trade }) {
  const pts = [
    { key: 'SL', v: t.stopLoss, cls: 'text-down', above: false },
    { key: 'Entry', v: t.entryPrice, cls: 'text-accent', above: true },
    { key: 'Exit', v: t.exitPrice, cls: 'text-fg', above: true },
    { key: 'Target', v: t.target, cls: 'text-up', above: false },
  ].filter((p): p is { key: string; v: number; cls: string; above: boolean } => !!p.v)
  const vals = pts.map((p) => p.v)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const pos = (v: number) => (max === min ? 50 : 8 + ((v - min) / (max - min)) * 84)
  const profit = (t.side === 'Long' ? 1 : -1) * (t.exitPrice - t.entryPrice) > 0
  const lo = Math.min(pos(t.entryPrice), pos(t.exitPrice))
  const hi = Math.max(pos(t.entryPrice), pos(t.exitPrice))

  return (
    <div className="relative mx-2 my-2 h-24 select-none" aria-label="Price ladder">
      <div className="absolute left-0 right-0 top-1/2 h-px bg-line" />
      <div className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded ${profit ? 'bg-up/60' : 'bg-down/60'}`} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
      {pts.map((p) => (
        <div key={p.key} className="absolute top-1/2 -translate-x-1/2" style={{ left: `${pos(p.v)}%` }}>
          <div className={`h-3 w-3 -translate-y-1/2 rounded-full border-2 border-panel bg-current ${p.cls}`} />
          <div className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center text-[11px] leading-tight ${p.above ? 'bottom-5' : 'top-2'}`}>
            <div className="text-muted">{p.key}</div>
            <div className={`num font-semibold ${p.cls}`}>{price(p.v)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function TradeDetail({ row, settings, position, onClose, onEdit, onDelete, onDuplicate, onPrev, onNext }: Props) {
  const { trade: t, res } = row
  const [zoom, setZoom] = useState<string | null>(null)

  useEffect(() => {
    if (zoom) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft' && onPrev) onPrev()
      if (e.key === 'ArrowRight' && onNext) onNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, onPrev, onNext])

  const copyText = async () => {
    const text = tradeSummary(row)
    try {
      await navigator.clipboard.writeText(text)
      toast('Trade summary copied')
    } catch {
      // Clipboard API needs a secure context/permission; fall back to a hidden textarea.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      toast(ok ? 'Trade summary copied' : "Couldn't copy to clipboard", ok ? 'success' : 'error')
    }
  }

  const risk = t.stopLoss ? Math.abs(t.entryPrice - t.stopLoss) * t.qty : 0
  const reward = t.target ? Math.abs(t.target - t.entryPrice) * t.qty : 0
  const hold = holdMinutes(t)
  const turnover = (t.entryPrice + t.exitPrice) * t.qty
  const a = adherence([row])
  const c = res.charges

  const verdicts: { ok: boolean; text: string }[] = []
  if (a.asPlanned) verdicts.push({ ok: true, text: 'Exited at your stop-loss as planned.' })
  if (a.cutEarly) verdicts.push({ ok: true, text: 'Cut the loss before your stop-loss was hit.' })
  if (a.heldPast) verdicts.push({ ok: false, text: `Held past your stop-loss by ${a.avgOvershootR.toFixed(1)}R.` })
  if (a.hit) verdicts.push({ ok: true, text: 'Reached your target.' })
  if (a.exitedEarly) verdicts.push({ ok: false, text: a.avgLeftR > 0 ? `Exited in profit before target, leaving about ${a.avgLeftR.toFixed(1)}R (${inr(a.leftAmount, 2)}) on the table.` : 'Exited in profit before your target.' })
  if (a.lossWithTarget) verdicts.push({ ok: false, text: 'Target was never reached; the trade ended in a loss.' })
  if (!t.stopLoss && !t.target) verdicts.push({ ok: false, text: "No stop-loss or target recorded, so execution can't be judged." })
  else if (!t.stopLoss) verdicts.push({ ok: false, text: "No stop-loss recorded, so R can't be calculated." })

  const title = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <SymbolAvatar symbol={t.symbol} />
      <span className="font-display text-lg font-bold tracking-wide">{t.symbol}</span>
      <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${t.side === 'Long' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>{t.side.toUpperCase()}</span>
      <span className="text-sm font-normal text-muted">{t.date}{t.entryTime && ` · ${time12(t.entryTime)}`}{t.exitTime && ` → ${time12(t.exitTime)}`}</span>
    </div>
  )

  return (
    <>
      <Modal
        title={title}
        onClose={onClose}
        size="xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <button className="btn-ghost !px-2.5 !py-1" onClick={onPrev} disabled={!onPrev} aria-label="Newer trade">‹</button>
              <span className="num">{position.index + 1} / {position.total}</span>
              <button className="btn-ghost !px-2.5 !py-1" onClick={onNext} disabled={!onNext} aria-label="Older trade">›</button>
              <span className="hidden md:inline">use ← → keys</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost !text-down" onClick={onDelete}>Delete</button>
              <button className="btn-ghost" onClick={copyText} title="Copy a text summary to the clipboard">Copy text</button>
              <button className="btn-ghost" onClick={onDuplicate} title="Start a new trade from this one">Duplicate</button>
              <button className="btn" onClick={onEdit}>Edit trade</button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="label !mb-0.5">Net P&amp;L</div>
              <div className={`num text-5xl font-semibold tracking-tight ${pnlColor(res.net)} ${res.net > 0 ? 'glow-up' : res.net < 0 ? 'glow-down' : ''}`}>{res.net > 0 ? '+' : ''}{inr(res.net, 2)}</div>
            </div>
            <div className="text-right text-sm text-muted">
              <div className={`num text-lg font-semibold ${pnlColor(res.net)}`}>{res.returnPct > 0 ? '+' : ''}{pct(res.returnPct)}</div>
              <div>return on {inr(t.entryPrice * t.qty)}</div>
            </div>
          </div>

          <Ladder t={t} />

          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Metric label="Quantity" value={String(t.qty)} />
            <Metric label="Entry → Exit" value={`${price(t.entryPrice)} → ${price(t.exitPrice)}`} />
            <Metric label="Gross P&L" value={inr(res.gross, 2)} className={pnlColor(res.gross)} />
            <Metric label="Charges" value={inr(c.total, 2)} />
            <Metric label="R multiple" value={res.rMultiple !== null ? `${res.rMultiple}R` : '–'} className={res.rMultiple !== null ? pnlColor(res.rMultiple) : ''} />
            <Metric label="Risk (to stop)" value={risk ? inr(risk, 2) : '–'} />
            <Metric label="Planned reward" value={reward ? inr(reward, 2) : '–'} />
            <Metric label="Planned R:R" value={risk && reward ? `1 : ${(reward / risk).toFixed(1)}` : '–'} />
            <Metric label="Hold time" value={hold !== null ? fmtMin(hold) : '–'} />
            <Metric label="Turnover" value={inr(turnover)} />
            <Metric label="Setup" value={t.setup || '–'} />
            <Metric label="Emotion" value={t.emotion || '–'} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-line p-3.5">
              <h3 className="mb-2 text-sm font-semibold">Charges breakdown</h3>
              <table className="w-full text-sm">
                <tbody>
                  {([['Brokerage', c.brokerage], ['STT', c.stt], ['Exchange txn', c.exchange], ['SEBI fee', c.sebi], ['Stamp duty', c.stamp], ['GST', c.gst]] as const).map(([k, v]) => (
                    <tr key={k} className="border-b border-line/60"><td className="py-1.5 text-muted">{k}</td><td className="num py-1.5 text-right">{inr(v, 2)}</td></tr>
                  ))}
                  <tr><td className="pt-2 font-semibold">Total</td><td className="num pt-2 text-right font-semibold">{inr(c.total, 2)}</td></tr>
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted">Calculated with the rates in Settings ({settings.rates.gstPct}% GST).</p>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-line p-3.5">
                <h3 className="mb-2 text-sm font-semibold">Discipline</h3>
                <p className="text-sm">{t.followedPlan ? <span className="text-up">✓ Followed the plan</span> : <span className="text-warn">⚠ Did not follow the plan</span>}</p>
                {t.confidence && <p className="mt-1 text-sm text-muted">Confidence: <b className="text-fg">{t.confidence}/5</b></p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.mistakes.length ? t.mistakes.map((m) => <span key={m} className="rounded-full border border-down/50 bg-down/10 px-2.5 py-0.5 text-xs text-down">{m}</span>) : <span className="text-xs text-muted">No mistakes tagged</span>}
                </div>
              </div>
              <div className="rounded-xl border border-line p-3.5">
                <h3 className="mb-2 text-sm font-semibold">Execution</h3>
                <ul className="space-y-1 text-sm">
                  {verdicts.map((v, i) => <li key={i} className={v.ok ? 'text-up' : 'text-warn'}>{v.ok ? '✓' : '•'} <span className="text-fg">{v.text}</span></li>)}
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line p-3.5">
            <h3 className="mb-1.5 text-sm font-semibold">Notes</h3>
            {t.notes.trim() ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.notes}</p> : <p className="text-sm text-muted">No notes for this trade.</p>}
          </div>

          {!!t.screenshots?.length && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Screenshots</h3>
              <div className="flex flex-wrap gap-3">
                {t.screenshots.map((src, i) => (
                  <button key={i} onClick={() => setZoom(src)} className="overflow-hidden rounded-lg border border-line transition hover:border-accent" aria-label={`Open screenshot ${i + 1}`}>
                    <img src={src} alt={`Screenshot ${i + 1}`} className="h-28 object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {zoom && (
        <Modal title="Screenshot" size="full" z={70} onClose={() => setZoom(null)}>
          <img src={zoom} alt="Trade screenshot" className="mx-auto max-h-[75vh] max-w-full rounded-lg" />
        </Modal>
      )}
    </>
  )
}
