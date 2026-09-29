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

import PageTitle from '../components/PageTitle'
import CapitalInput from '../components/CapitalInput'
import { monthlyCapital } from '../lib/capital'
import { localDate } from '../lib/week'
import { inr, pnlColor } from '../lib/format'
import type { Row } from '../lib/stats'

interface Props { rows: Row[]; settings: Settings; save: (s: Settings) => void; refresh: () => void }

export default function SettingsPage({ rows, settings, save, refresh }: Props) {
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const monthRows = [...monthlyCapital(rows, settings, localDate().slice(0, 7)).values()].reverse()
  const setMonthCap = (m: string, v: number | null) => {
    const next = { ...settings.monthCapital }
    if (v === null) delete next[m]
    else next[m] = v
    save({ ...settings, monthCapital: next })
  }
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
      <PageTitle title="Settings" sub="Capital, risk rules, charge rates and backup" />
      <div className="card space-y-3">
        <h2 className="text-sm font-semibold">General</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div><label className="label">Default trading capital (₹) · per month</label>
            <input type="number" className="input" value={settings.startingCapital} onChange={(e) => save({ ...settings, startingCapital: Number(e.target.value) })} /></div>
          <div><label className="label">Setups (comma separated)</label>
            <input className="input" defaultValue={settings.setups.join(', ')} onBlur={(e) => save({ ...settings, setups: list(e.target.value) })} /></div>
          <div><label className="label">Mistake tags (comma separated)</label>
            <input className="input" defaultValue={settings.mistakeTags.join(', ')} onBlur={(e) => save({ ...settings, mistakeTags: list(e.target.value) })} /></div>
        </div>
      </div>

      <div className="card space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Monthly trading capital</h2>
          <p className="mt-0.5 text-xs text-muted">
            The fixed amount you trade with for the whole month. Each month's return % is its net P&amp;L divided by that amount only, so profits and losses never roll into the next month.
            A month you haven't set reuses the previous month's amount. Highlighted fields are amounts you typed.
          </p>
        </div>
        {monthRows.length === 0 ? <p className="py-4 text-sm text-muted">Add trades to see months here.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted">
                <tr>{['Month', 'Trading capital', 'Trades', 'Net P&L', 'Return'].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {monthRows.map((c) => (
                  <tr key={c.month} className="border-t border-line">
                    <td className="px-2 py-2 font-medium">{new Date(Number(c.month.slice(0, 4)), Number(c.month.slice(5)) - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' })}</td>
                    <td className="px-2 py-1.5"><CapitalInput compact value={c.capital} overridden={c.overridden} onSave={(v) => setMonthCap(c.month, v)} /></td>
                    <td className="num px-2 py-2">{c.trades}</td>
                    <td className={`num px-2 py-2 font-semibold ${pnlColor(c.net)}`}>{c.net > 0 ? '+' : ''}{inr(c.net)}</td>
                    <td className={`num px-2 py-2 font-semibold ${pnlColor(c.returnPct)}`}>{c.trades ? `${c.returnPct > 0 ? '+' : ''}${c.returnPct.toFixed(2)}%` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold">Risk rules <span className="text-xs font-normal text-muted">(0 turns a rule off)</span></h2>
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
          <h2 className="text-sm font-semibold">Charge rates</h2>
          <button className="btn-ghost" onClick={() => save({ ...settings, rates: DEFAULT_SETTINGS.rates })}>Reset to defaults</button>
        </div>
        <p className="text-xs text-warn">These defaults are approximate. Verify them against Dhan's brokerage page and current NSE/SEBI rates; changes apply to all trades immediately.</p>
        <div className="grid gap-3 md:grid-cols-3">
          {(Object.keys(RATE_LABELS) as (keyof ChargeRates)[]).map((k) => (
            <div key={k}><label className="label">{RATE_LABELS[k]}</label>
              <input type="number" step="any" className="input" value={settings.rates[k]}
                onChange={(e) => save({ ...settings, rates: { ...settings.rates, [k]: Number(e.target.value) } })} /></div>
          ))}
        </div>
      </div>

      <div className="card space-y-2">
        <h2 className="text-sm font-semibold">Backup</h2>
        <p className="text-xs text-muted">Data is stored in this browser only. Export regularly.</p>
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
