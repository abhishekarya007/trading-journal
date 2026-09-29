import { useMemo, useState } from 'react'
import type { Settings, Trade } from '../lib/types'
import { EMOTIONS } from '../lib/defaults'
import { calcTrade } from '../lib/calc'
import { localDate } from '../lib/week'
import { inr, pnlColor } from '../lib/format'
import { fileToDataUrl } from '../lib/image'
import { evaluateDay } from '../lib/risk'
import type { Row } from '../lib/stats'
import RiskBanner from './RiskBanner'

const today = () => localDate()

const blank = (settings: Settings): Trade => ({
  date: today(), symbol: '', side: 'Long', qty: 0, entryPrice: 0, exitPrice: 0,
  setup: settings.setups[0] ?? '', emotion: 'Calm', followedPlan: true, mistakes: [], notes: '',
})

interface Props {
  settings: Settings
  initial?: Trade
  prefill?: Trade // start a NEW trade from a template (e.g. a duplicate)
  rows: Row[]
  onSave: (t: Trade) => void
  onCancel?: () => void
}

export default function TradeForm({ settings, initial, prefill, rows, onSave, onCancel }: Props) {
  const [t, setT] = useState<Trade>(initial ?? prefill ?? blank(settings))
  const [imgError, setImgError] = useState('')
  const warnings = useMemo(() => evaluateDay(rows, t.date, settings.risk), [rows, t.date, settings.risk])

  const addImages = async (files: File[]) => {
    setImgError('')
    try {
      const urls = await Promise.all(files.filter((f) => f.type.startsWith('image/')).map((f) => fileToDataUrl(f)))
      if (urls.length) setT((p) => ({ ...p, screenshots: [...(p.screenshots ?? []), ...urls] }))
    } catch (e) { setImgError((e as Error).message) }
  }
  const set = <K extends keyof Trade>(k: K, v: Trade[K]) => setT((p) => ({ ...p, [k]: v }))
  const num = (k: 'qty' | 'entryPrice' | 'exitPrice' | 'stopLoss' | 'target') => ({
    type: 'number' as const, step: 'any', min: 0, className: 'input',
    value: t[k] || '', // show an empty box rather than 0 for unfilled prices/quantity
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k, (e.target.value === '' ? (k === 'stopLoss' || k === 'target' ? undefined : 0) : Number(e.target.value)) as never),
  })

  const valid = t.symbol.trim() && t.qty > 0 && t.entryPrice > 0 && t.exitPrice > 0
  const preview = useMemo(() => (valid ? calcTrade(t, settings.rates) : null), [t, valid, settings.rates])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onSave({ ...t, symbol: t.symbol.trim().toUpperCase() })
    if (!initial) setT(blank(settings))
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <RiskBanner warnings={warnings} title={`Risk rules for ${t.date} — think before adding another trade`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div><label className="label">Date</label><input type="date" className="input" value={t.date} onChange={(e) => set('date', e.target.value)} required /></div>
        <div><label className="label">Symbol</label><input data-autofocus={!initial && !prefill ? true : undefined} className="input uppercase" placeholder="RELIANCE" value={t.symbol} onChange={(e) => set('symbol', e.target.value)} required /></div>
        <div><label className="label">Side</label>
          <select className="input" value={t.side} onChange={(e) => set('side', e.target.value as Trade['side'])}><option>Long</option><option>Short</option></select></div>
        <div><label className="label">Quantity</label><input {...num('qty')} step={1} /></div>
        <div><label className="label">Entry price</label><input {...num('entryPrice')} /></div>
        <div><label className="label">Exit price</label><input data-autofocus={prefill ? true : undefined} {...num('exitPrice')} /></div>
        <div><label className="label">Stop-loss (optional)</label><input {...num('stopLoss')} /></div>
        <div><label className="label">Target (optional)</label><input {...num('target')} /></div>
        <div><label className="label">Entry time (optional)</label><input type="time" className="input" value={t.entryTime ?? ''} onChange={(e) => set('entryTime', e.target.value || undefined)} /></div>
        <div><label className="label">Exit time (optional)</label><input type="time" className="input" value={t.exitTime ?? ''} onChange={(e) => set('exitTime', e.target.value || undefined)} /></div>
        <div><label className="label">Setup</label>
          <select className="input" value={t.setup} onChange={(e) => set('setup', e.target.value)}>{settings.setups.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="label">Emotion</label>
          <select className="input" value={t.emotion} onChange={(e) => set('emotion', e.target.value)}>{EMOTIONS.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="label">Confidence (optional)</label>
          <div className="seg w-full" role="group" aria-label="Confidence from 1 to 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" className="flex-1" aria-pressed={t.confidence === n}
                title={['Very unsure', 'Unsure', 'Neutral', 'Confident', 'Very confident'][n - 1]}
                onClick={() => set('confidence', t.confidence === n ? undefined : n)}>{n}</button>
            ))}
          </div></div>
        <div className="flex items-end pb-1.5"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={t.followedPlan} onChange={(e) => set('followedPlan', e.target.checked)} /> Followed my plan</label></div>
      </div>
      <div>
        <span className="label">Mistakes</span>
        <div className="flex flex-wrap gap-2">
          {settings.mistakeTags.map((m) => {
            const on = t.mistakes.includes(m)
            return (
              <button type="button" key={m}
                onClick={() => set('mistakes', on ? t.mistakes.filter((x) => x !== m) : [...t.mistakes, m])}
                className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-down bg-down/10 text-down' : 'border-line'}`}>{m}</button>
            )
          })}
        </div>
      </div>
      <div><label className="label">Notes</label><textarea className="input" rows={2} value={t.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Why did you take it? What would you do differently?" /></div>
      <div onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); addImages(f) } }}>
        <label className="label">Chart screenshots (choose files, or paste an image anywhere in this box)</label>
        <input type="file" accept="image/*" multiple className="block text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-panel2 file:px-3 file:py-1.5 file:text-sm file:text-fg hover:file:bg-line" onChange={(e) => { addImages([...(e.target.files ?? [])]); e.target.value = '' }} />
        <input className="input mt-2" placeholder="Click here and press Ctrl/Cmd+V to paste a screenshot" readOnly />
        {imgError && <p className="mt-1 text-xs text-down">{imgError}</p>}
        {!!t.screenshots?.length && (
          <div className="mt-2 flex flex-wrap gap-2">
            {t.screenshots.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt={`Screenshot ${i + 1}`} className="h-20 rounded border border-line" />
                <button type="button" aria-label="Remove screenshot" className="absolute -right-1.5 -top-1.5 rounded-full bg-down px-1.5 text-xs text-white"
                  onClick={() => set('screenshots', t.screenshots!.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {preview ? (
            <>Gross {inr(preview.gross, 2)} · Charges {inr(preview.charges.total, 2)} · <b className={pnlColor(preview.net)}>Net {inr(preview.net, 2)}</b>
              {preview.rMultiple !== null && <> · {preview.rMultiple}R</>}</>
          ) : <span className="text-muted">Fill symbol, qty and prices to preview net P&amp;L</span>}
        </div>
        <div className="flex gap-2">
          {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
          <button className="btn disabled:opacity-50" disabled={!valid}>{initial ? 'Update trade' : 'Add trade'}</button>
        </div>
      </div>
    </form>
  )
}
