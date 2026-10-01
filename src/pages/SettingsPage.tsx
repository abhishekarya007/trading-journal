import { useEffect, useRef, useState } from 'react'
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
import { toast } from '../lib/toast'
import { agoText, backupStatus, downloadBackup, requestStorageProtection, setAutoBackup, storageProtected, useBackupInfo } from '../lib/backup'
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
  const setMonthGoal = (m: string, v: number | null) => {
    const next = { ...settings.monthGoal }
    if (v === null) delete next[m]
    else next[m] = v
    save({ ...settings, monthGoal: next })
  }
  const setMonthLoss = (m: string, v: number | null) => {
    const next = { ...settings.monthMaxLoss }
    if (v === null) delete next[m]
    else next[m] = v
    save({ ...settings, monthMaxLoss: next })
  }
  const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)

  const info = useBackupInfo()
  const st = backupStatus(rows.length, info, Date.now())
  const [protectedState, setProtectedState] = useState<boolean | null>(null)
  useEffect(() => { storageProtected().then(setProtectedState) }, [])
  const doExport = async () => {
    try { const name = await downloadBackup(settings, rows.length); toast(`Backup saved: ${name}`) } catch { toast('Backup failed', 'error') }
  }
  const protect = async () => {
    const ok = await requestStorageProtection()
    setProtectedState(ok)
    toast(ok ? 'Storage is now protected' : 'Your browser declined. Keep regular backups instead.', ok ? 'success' : 'info')
  }
  const doImport = async (f: File) => {
    try {
      const snapshot = await exportJson(settings) // taken first so the import can be undone
      const { settings: s, count } = await importJson(await f.text())
      save(s); refresh(); setMsg(`Imported ${count} trades (this replaced your previous trades).`)
      toast(`Imported ${count} trades`, 'success', {
        action: {
          label: 'Undo',
          run: async () => { const back = await importJson(snapshot); save(back.settings); refresh(); setMsg('Import undone.'); toast('Previous data restored', 'info') },
        },
      })
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
          <div><label className="label">Default monthly profit goal (₹) · 0 = none</label>
            <input type="number" min={0} className="input" value={settings.goals.profit} onChange={(e) => save({ ...settings, goals: { ...settings.goals, profit: Number(e.target.value) } })} /></div>
          <div><label className="label">Default monthly loss limit (₹) · 0 = none</label>
            <input type="number" min={0} className="input" value={settings.goals.maxLoss} onChange={(e) => save({ ...settings, goals: { ...settings.goals, maxLoss: Number(e.target.value) } })} /></div>
          <div><label className="label">Setups (comma separated)</label>
            <input className="input" defaultValue={settings.setups.join(', ')} onBlur={(e) => save({ ...settings, setups: list(e.target.value) })} /></div>
          <div><label className="label">Mistake tags (comma separated)</label>
            <input className="input" defaultValue={settings.mistakeTags.join(', ')} onBlur={(e) => save({ ...settings, mistakeTags: list(e.target.value) })} /></div>
          <div><label className="label">Exit mistakes (tags about leaving a trade)</label>
            <input className="input" defaultValue={settings.exitMistakes.join(', ')} onBlur={(e) => save({ ...settings, exitMistakes: list(e.target.value) })} />
            <p className="mt-1 text-[11px] text-muted">Counted, but not priced or used to remove trades from the disciplined comparison.</p></div>
        </div>
      </div>

      <div className="card space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Monthly capital, goal &amp; loss limit</h2>
          <p className="mt-0.5 text-xs text-muted">
            The fixed amount you trade with for the whole month. Each month's return % is its net P&amp;L divided by that amount only, so profits and losses never roll into the next month.
            A month you haven't set reuses the previous month's amount. Highlighted fields are amounts you typed.
            The profit goal and loss limit work the same way: set them for a month and later months keep them until you change them (0 turns one off).
          </p>
        </div>
        {monthRows.length === 0 ? <p className="py-4 text-sm text-muted">Add trades to see months here.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-muted">
                <tr>{['Month', 'Trading capital', 'Profit goal ₹', 'Loss limit ₹', 'Trades', 'Net P&L', 'Return'].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {monthRows.map((c) => (
                  <tr key={c.month} className="border-t border-line">
                    <td className="px-2 py-2 font-medium">{new Date(Number(c.month.slice(0, 4)), Number(c.month.slice(5)) - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' })}</td>
                    <td className="px-2 py-1.5"><CapitalInput compact value={c.capital} overridden={c.overridden} onSave={(v) => setMonthCap(c.month, v)} /></td>
                    <td className="px-2 py-1.5"><CapitalInput compact value={c.goal} overridden={c.goalOverridden} onSave={(v) => setMonthGoal(c.month, v)} /></td>
                    <td className="px-2 py-1.5"><CapitalInput compact value={c.maxLoss} overridden={c.maxLossOverridden} onSave={(v) => setMonthLoss(c.month, v)} /></td>
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
              <input type="number" min={0} step="any" className="input" value={settings.risk[k]}
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
        <p className="text-xs leading-relaxed text-muted">
          Your trades live only in this browser. A backup is one file holding everything (trades, reviews and settings). Keep it in Google Drive or on a USB drive and you can restore it on any computer.
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-panel2/40 px-3.5 py-2.5 text-sm">
          <span className={`h-2 w-2 rounded-full ${st.state === 'ok' ? 'bg-up' : st.state === 'due' ? 'bg-warn' : st.state === 'empty' ? 'bg-muted/50' : 'bg-down'}`} />
          <span className="font-medium">{st.state === 'empty' ? 'No trades yet' : st.state === 'never' ? 'Never backed up' : `Last backup: ${agoText(st.days)}`}</span>
          {st.state !== 'empty' && <span className="text-xs text-muted">{st.newSince > 0 ? `${st.newSince} trade${st.newSince === 1 ? '' : 's'} added since` : 'everything is saved'}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={doExport}>Back up now</button>
          <button className="btn-ghost" onClick={() => file.current?.click()}>Restore from a backup…</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={info.auto} onChange={(e) => setAutoBackup(e.target.checked)} />
          <span>Download a backup automatically when one is due
            <span className="block text-xs text-muted">Checked when you open the app, about once a week. The file goes to your Downloads folder, so move it somewhere safe. Your browser may ask permission the first time.</span></span>
        </label>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-sm">
          <span className="font-medium">Browser storage protection:</span>
          <span className={protectedState ? 'text-up' : 'text-warn'}>{protectedState === null ? 'unknown' : protectedState ? 'on, the browser won’t clear your data to free space' : 'off'}</span>
          {protectedState === false && <button type="button" className="btn-ghost !px-2.5 !py-1 text-xs" onClick={protect}>Turn on</button>}
        </div>
        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </div>
  )
}
