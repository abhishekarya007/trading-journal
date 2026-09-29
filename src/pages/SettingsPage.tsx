import { useRef, useState } from 'react'
import type { ChargeRates, Settings } from '../lib/types'
import { exportJson, importJson } from '../lib/db'
import { DEFAULT_SETTINGS } from '../lib/defaults'

const RATE_LABELS: Record<keyof ChargeRates, string> = {
  intradayBrokerageFlat: 'Brokerage cap (₹/order)',
  intradayBrokeragePct: 'Brokerage (% of order)',
  sttIntradaySellPct: 'STT (% sell)',
  exchangeTxnPct: 'Exchange txn charge (%)',
  sebiPct: 'SEBI fee (%)',
  stampIntradayBuyPct: 'Stamp duty (% buy)',
  gstPct: 'GST (%)',
}

interface Props { settings: Settings; save: (s: Settings) => void; refresh: () => void }

export default function SettingsPage({ settings, save, refresh }: Props) {
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)

  const doExport = async () => {
    const blob = new Blob([await exportJson(settings)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `trading-journal-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const doImport = async (f: File) => {
    if (!confirm('Importing replaces ALL current trades. Continue?')) return
    try {
      const { settings: s, count } = await importJson(await f.text())
      save(s); refresh(); setMsg(`Imported ${count} trades.`)
    } catch (e) { setMsg(`Import failed: ${(e as Error).message}`) }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="text-sm font-medium">General</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div><label className="label">Starting capital (₹)</label>
            <input type="number" className="input" value={settings.startingCapital} onChange={(e) => save({ ...settings, startingCapital: Number(e.target.value) })} /></div>
          <div><label className="label">Setups (comma separated)</label>
            <input className="input" defaultValue={settings.setups.join(', ')} onBlur={(e) => save({ ...settings, setups: list(e.target.value) })} /></div>
          <div><label className="label">Mistake tags (comma separated)</label>
            <input className="input" defaultValue={settings.mistakeTags.join(', ')} onBlur={(e) => save({ ...settings, mistakeTags: list(e.target.value) })} /></div>
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-medium">Risk rules <span className="text-xs font-normal text-slate-500">(0 turns a rule off)</span></h2>
        <div className="grid gap-3 md:grid-cols-3">
          {([['dailyLossLimit', 'Daily loss limit (₹)'], ['maxConsecutiveLosses', 'Max consecutive losses'], ['maxTradesPerDay', 'Max trades per day']] as const).map(([k, label]) => (
            <div key={k}><label className="label">{label}</label>
              <input type="number" min={0} className="input" value={settings.risk[k]}
                onChange={(e) => save({ ...settings, risk: { ...settings.risk, [k]: Number(e.target.value) } })} /></div>
          ))}
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Charge rates</h2>
          <button className="btn-ghost" onClick={() => save({ ...settings, rates: DEFAULT_SETTINGS.rates })}>Reset to defaults</button>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400">These defaults are approximate. Verify them against Dhan's brokerage page and current NSE/SEBI rates; changes apply to all trades immediately.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {(Object.keys(RATE_LABELS) as (keyof ChargeRates)[]).map((k) => (
            <div key={k}><label className="label">{RATE_LABELS[k]}</label>
              <input type="number" step="any" className="input" value={settings.rates[k]}
                onChange={(e) => save({ ...settings, rates: { ...settings.rates, [k]: Number(e.target.value) } })} /></div>
          ))}
        </div>
      </div>

      <div className="card space-y-2">
        <h2 className="text-sm font-medium">Backup</h2>
        <p className="text-xs text-slate-500">Data is stored in this browser only. Export regularly.</p>
        <div className="flex gap-2">
          <button className="btn" onClick={doExport}>Export JSON</button>
          <button className="btn-ghost" onClick={() => file.current?.click()}>Import JSON</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        </div>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </div>
  )
}
