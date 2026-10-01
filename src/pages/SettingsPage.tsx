import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Tabs from '../components/Tabs'
import { ACCENTS, setAppearance, TEXT_SIZES, useAppearance, useTheme } from '../lib/appearance'
import { SECTIONS, SETTINGS_TABS, searchSettings, type SectionId, type SettingsTab } from '../lib/settingsSearch'
import type { ChargeRates, Settings, WeeklyReview } from '../lib/types'
import { db, exportJson, importJson, mergeBackup } from '../lib/db'
import { formatBytes, mergeSettings, parseBackup, screenshotStats, type ParsedBackup } from '../lib/backupMerge'
import ImportDialog, { type ImportMode } from '../components/ImportDialog'
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
import { downloadText, tradesToCsv } from '../lib/csv'
import { chime } from '../lib/cooldown'
import { playSound, setFeedback, useFeedback, vibrate, type FeedbackKind, type Volume } from '../lib/feedback'
import { agoText, backupStatus, downloadBackup, requestStorageProtection, setAutoBackup, setBackupScreenshots, storageProtected, useBackupInfo } from '../lib/backup'
import { readBackupFile } from '../lib/zipBackup'
import CapitalInput from '../components/CapitalInput'
import { monthlyCapital } from '../lib/capital'
import { localDate } from '../lib/week'
import { inr, pnlColor } from '../lib/format'
import type { Row } from '../lib/stats'

/** A whole-number field that saves when you leave it, so you can clear it and type a new value freely. */
function MinutesField({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])
  const commit = () => {
    const n = Math.round(Number(draft))
    if (!Number.isFinite(n) || n < 1) { setDraft(String(value)); return }
    const clamped = Math.min(240, n)
    setDraft(String(clamped))
    if (clamped !== value) onSave(clamped)
  }
  return (
    <input type="number" min={1} max={240} className="input" value={draft} aria-label="Default cooldown length in minutes"
      onChange={(e) => setDraft(e.target.value)} onFocus={(e) => e.target.select()} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )
}

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
  const [params, setParams] = useSearchParams()
  const tab: SettingsTab = SETTINGS_TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as SettingsTab) : 'general'
  const setTab = (t: SettingsTab) => { setQuery(''); setParams(t === 'general' ? {} : { tab: t }, { replace: true }) }
  const [query, setQuery] = useState('')
  const hits = searchSettings(query)
  const searching = query.trim() !== ''
  // While searching, show every matching section whatever tab it lives on.
  const show = (id: SectionId) => (searching ? hits.includes(id) : SECTIONS.find((s) => s.id === id)?.tab === tab)
  const look = useAppearance()
  const { dark, setDark } = useTheme()

  const list = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)

  const info = useBackupInfo()
  const st = backupStatus(rows.length, info, Date.now())
  const [protectedState, setProtectedState] = useState<boolean | null>(null)
  useEffect(() => { storageProtected().then(setProtectedState) }, [])
  const fb = useFeedback()
  const shots = screenshotStats(rows.map((r) => r.trade))
  const liteBase = rows.length * 500 + 2000 // rough size of a backup without images (measured: about 440 bytes a trade)
  const doExport = async (screenshots?: boolean) => {
    try { const name = await downloadBackup(settings, rows.length, Date.now(), screenshots === undefined ? {} : { screenshots }); toast(`Backup saved: ${name}`) } catch { toast('Backup failed', 'error') }
  }
  const exportCsv = () => {
    const all = [...rows].sort((a, b) => a.trade.date.localeCompare(b.trade.date) || (a.trade.id ?? 0) - (b.trade.id ?? 0))
    downloadText(`trades-all-${new Date().toISOString().slice(0, 10)}.csv`, tradesToCsv(all))
    toast(`${all.length} trades exported to CSV`)
  }
  const protect = async () => {
    const ok = await requestStorageProtection()
    setProtectedState(ok)
    toast(ok ? 'Storage is now protected' : 'Your browser declined. Keep regular backups instead.', ok ? 'success' : 'info')
  }
  // Choosing a file only reads it. Nothing changes until you pick how to restore it in the dialog.
  const [pending, setPending] = useState<{ parsed: ParsedBackup; text: string; name: string; reviews: WeeklyReview[] } | null>(null)
  const doImport = async (f: File) => {
    try {
      const text = await readBackupFile(f) // a .zip is unpacked, a .json is read as is
      setPending({ parsed: parseBackup(text), text, name: f.name, reviews: await db.reviews.toArray() })
      setMsg('')
    } catch (e) { setMsg(`Import failed: ${(e as Error).message}`) }
  }
  const runImport = async (mode: ImportMode) => {
    if (!pending) return
    const { parsed, text } = pending
    setPending(null)
    try {
      const snapshot = await exportJson(settings) // taken first so either choice can be undone
      const undo = {
        label: 'Undo',
        run: async () => { const back = await importJson(snapshot); save(back.settings); refresh(); setMsg('Restore undone.'); toast('Previous data restored', 'info') },
      }
      if (mode === 'replace') {
        const { settings: s, count } = await importJson(text)
        save(s); refresh()
        setMsg(`Replaced everything with ${count} trades from the backup.`)
        toast(`Replaced with ${count} trades`, 'success', { action: undo })
      } else {
        const r = await mergeBackup(parsed)
        save(mergeSettings(settings, parsed.settings)); refresh()
        const parts = [`Added ${r.added} trade${r.added === 1 ? '' : 's'}`, r.skipped ? `skipped ${r.skipped} you already had` : '', r.reviewsAdded + r.reviewsFilled ? `${r.reviewsAdded + r.reviewsFilled} weekly review${r.reviewsAdded + r.reviewsFilled === 1 ? '' : 's'} added or completed` : ''].filter(Boolean)
        setMsg(`${parts.join(', ')}.`)
        toast(parts.slice(0, 2).join(', '), 'success', { action: undo })
      }
    } catch (e) { setMsg(`Restore failed: ${(e as Error).message}`) }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Settings" sub="Capital, risk rules, charge rates and backup" />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs tabs={SETTINGS_TABS} value={tab} onChange={setTab} label="Settings sections" />
        <input type="search" className="input !w-full sm:!w-56" placeholder="Search settings…" aria-label="Search settings" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {searching && hits.length === 0 && <p className="card py-6 text-center text-sm text-muted">No setting matches “{query}”.</p>}
      {show('general') && <div className="card space-y-3">
        <h2 className="text-sm font-semibold">General</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div><label className="label">Setups (comma separated)</label>
            <input className="input" defaultValue={settings.setups.join(', ')} onBlur={(e) => save({ ...settings, setups: list(e.target.value) })} /></div>
          <div><label className="label">Mistake tags (comma separated)</label>
            <input className="input" defaultValue={settings.mistakeTags.join(', ')} onBlur={(e) => save({ ...settings, mistakeTags: list(e.target.value) })} /></div>
          <div><label className="label">Exit mistakes (tags about leaving a trade)</label>
            <input className="input" defaultValue={settings.exitMistakes.join(', ')} onBlur={(e) => save({ ...settings, exitMistakes: list(e.target.value) })} />
            <p className="mt-1 text-[11px] text-muted">Counted, but not priced or used to remove trades from the disciplined comparison.</p></div>
        </div>
      </div>}

      {show('defaults') && <div className="card space-y-3">
        <h2 className="text-sm font-semibold">Defaults</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div><label className="label">Default trading capital (₹) · per month</label>
            <input type="number" className="input" value={settings.startingCapital} onChange={(e) => save({ ...settings, startingCapital: Number(e.target.value) })} /></div>
          <div><label className="label">Default monthly profit goal (₹) · 0 = none</label>
            <input type="number" min={0} className="input" value={settings.goals.profit} onChange={(e) => save({ ...settings, goals: { ...settings.goals, profit: Number(e.target.value) } })} /></div>
          <div><label className="label">Default monthly loss limit (₹) · 0 = none</label>
            <input type="number" min={0} className="input" value={settings.goals.maxLoss} onChange={(e) => save({ ...settings, goals: { ...settings.goals, maxLoss: Number(e.target.value) } })} /></div>
        </div>
      </div>}

      {show('appearance') && <div className="card space-y-4">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div><span className="label">Theme</span>
            <div className="seg" role="group" aria-label="Theme">
              <button type="button" aria-pressed={dark} onClick={() => setDark(true)}>Dark</button>
              <button type="button" aria-pressed={!dark} onClick={() => setDark(false)}>Light</button>
            </div></div>
          <div><span className="label">Text size</span>
            <div className="seg" role="group" aria-label="Text size">
              {TEXT_SIZES.map((t) => <button key={t.id} type="button" aria-pressed={look.text === t.id} onClick={() => setAppearance({ text: t.id })}>{t.label}</button>)}
            </div></div>
          <div><span className="label">Accent colour</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Accent colour">
              {ACCENTS.map((a) => (
                <button key={a.id} type="button" aria-pressed={look.accent === a.id} onClick={() => setAppearance({ accent: a.id })}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition ${look.accent === a.id ? 'border-accent bg-accent/15' : 'border-line hover:border-accent/50'}`}>
                  <span className="h-3.5 w-3.5 rounded-full" style={{ background: a.swatch }} />{a.label}
                </button>
              ))}
            </div></div>
        </div>
      </div>}

      {show('monthly') && <div className="card space-y-3">
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
      </div>}

      {show('risk') && <div className="card space-y-3">
        <h2 className="text-sm font-semibold">Risk rules <span className="text-xs font-normal text-muted">(0 turns a rule off)</span></h2>
        <div className="grid gap-3 md:grid-cols-3">
          {([['dailyLossLimit', 'Daily loss limit (₹)'], ['maxConsecutiveLosses', 'Max consecutive losses'], ['maxTradesPerDay', 'Max trades per day']] as const).map(([k, label]) => (
            <div key={k}><label className="label">{label}</label>
              <input type="number" min={0} step="any" className="input" value={settings.risk[k]}
                onChange={(e) => save({ ...settings, risk: { ...settings.risk, [k]: Number(e.target.value) } })} /></div>
          ))}
        </div>
      </div>}

      {show('charges') && <div className="card space-y-3">
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
      </div>}

      {show('checklist') && <div className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Pre-trade checklist</h2>
            <p className="mt-0.5 text-xs text-muted">Open it any time with Z, or from the checklist button in the menu (the top bar on a phone). It shows whether you have a plan, are inside today&apos;s limits and are on a break, then your own questions to tick. Nothing is saved or asked automatically.</p>
          </div>
          <button className="btn-ghost" onClick={() => save({ ...settings, checklist: { items: DEFAULT_SETTINGS.checklist.items } })}>Reset questions</button>
        </div>
        <div>
          <label className="label" htmlFor="checklist-items">Your questions (one per line)</label>
          <textarea id="checklist-items" key={settings.checklist.items.join('|')} className="input" rows={5} defaultValue={settings.checklist.items.join('\n')}
            onBlur={(e) => save({ ...settings, checklist: { items: [...new Set(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))].slice(0, 12) } })} />
          <p className="mt-1 text-[11px] text-muted">Keep it short. 3 to 5 questions you would really answer. Up to 12.</p>
        </div>
      </div>}

      {show('cooldown') && <div className="card space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Cooldown timer</h2>
          <p className="mt-0.5 text-xs text-muted">A break timer for after a stop-loss. Start it from the menu or press <span className="kbd">C</span>.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div><label className="label">Default length (minutes)</label>
            <MinutesField value={settings.cooldown.minutes} onSave={(n) => save({ ...settings, cooldown: { ...settings.cooldown, minutes: n } })} /></div>
        </div>
        {([
          ['offerAfterLoss', 'Offer a cooldown when I log a losing trade', 'After you save a loss from today, a message asks if you want to start one.'],
          ['sound', 'Play a chime when it ends', 'Browsers only allow sound after you have used the page, which starting the timer counts as.'],
        ] as const).map(([k, title, hint]) => (
          <label key={k} className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={settings.cooldown[k]} onChange={(e) => save({ ...settings, cooldown: { ...settings.cooldown, [k]: e.target.checked } })} />
            <span>{title}<span className="block text-xs text-muted">{hint}</span></span>
          </label>
        ))}
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={settings.cooldown.notify}
            onChange={async (e) => {
              const want = e.target.checked
              if (want && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
                const p = await Notification.requestPermission()
                if (p !== 'granted') { toast('Your browser blocked notifications, so this stays off.', 'info'); return }
              }
              save({ ...settings, cooldown: { ...settings.cooldown, notify: want } })
            }} />
          <span>Show a browser notification when it ends<span className="block text-xs text-muted">Useful when this tab is in the background. Your browser will ask for permission.</span></span>
        </label>
        <button type="button" className="btn-ghost text-xs" onClick={() => { chime(); toast('That is the chime.', 'info') }}>Test the chime</button>
      </div>}

      {show('sound') && <div className="card space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Sound &amp; haptics</h2>
          <p className="mt-0.5 text-xs text-muted">A soft sound, and a short vibration on phones that support it. Saving a trade plays a sound for how it went (a win, a loss), and a special one when you reach your monthly goal or cross a risk limit. Other confirmations get a simple tick.</p>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={fb.sound} onChange={(e) => setFeedback({ sound: e.target.checked })} />
          <span>Play a soft sound<span className="block text-xs text-muted">Wins rise, losses are two calm low notes (never an alarm), goals chime, and limits pulse twice.</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent)]" checked={fb.haptics} onChange={(e) => setFeedback({ haptics: e.target.checked })} />
          <span>Vibrate<span className="block text-xs text-muted">Works on most Android phones. iPhones and computers have no vibration, so this does nothing there.</span></span>
        </label>
        <div className={fb.sound ? '' : 'pointer-events-none opacity-50'}>
          <div className="label">Volume</div>
          <div className="seg" role="group" aria-label="Sound volume">
            {(['quiet', 'normal', 'loud'] as Volume[]).map((v) => (
              <button key={v} aria-pressed={fb.volume === v} onClick={() => { setFeedback({ volume: v }); playSound('success', v) }}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Try them:</span>
          {([['win', 'Win'], ['loss', 'Loss'], ['goal', 'Goal reached'], ['limit', 'Limit hit'], ['success', 'Saved'], ['error', 'Error'], ['info', 'Notice']] as [FeedbackKind, string][]).map(([k, label]) => (
            <button key={k} type="button" className="btn-ghost !px-3 !py-1 text-xs" onClick={() => { playSound(k, fb.volume); vibrate(k) }}>{label}</button>
          ))}
        </div>
      </div>}

      {show('backup') && <div className="card space-y-2">
        <h2 className="text-sm font-semibold">Backup</h2>
        <p className="text-xs leading-relaxed text-muted">
          Your trades live only in this browser. A backup is one ZIP file: your trades, reviews and settings in data.json, and every screenshot as a normal image in a screenshots folder. Keep it in Google Drive or on a USB drive and you can restore it on any computer.
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-panel2/40 px-3.5 py-2.5 text-sm">
          <span className={`h-2 w-2 rounded-full ${st.state === 'ok' ? 'bg-up' : st.state === 'due' ? 'bg-warn' : st.state === 'empty' ? 'bg-muted/50' : 'bg-down'}`} />
          <span className="font-medium">{st.state === 'empty' ? 'No trades yet' : st.state === 'never' ? 'Never backed up' : `Last backup: ${agoText(st.days)}`}</span>
          {st.state !== 'empty' && <span className="text-xs text-muted">{st.newSince > 0 ? `${st.newSince} trade${st.newSince === 1 ? '' : 's'} added since` : 'everything is saved'}</span>}
          {st.state !== 'empty' && st.state !== 'never' && info.lite && shots.images > 0 && <span className="text-xs text-warn">· without screenshots</span>}
        </div>
        <div>
          <div className="label">Backup type</div>
          <div className="seg w-full max-w-lg" role="group" aria-label="Backup type">
            <button className="flex-1" aria-pressed={info.screenshots} onClick={() => setBackupScreenshots(true)}>Full · with screenshots</button>
            <button className="flex-1" aria-pressed={!info.screenshots} onClick={() => setBackupScreenshots(false)}>Lite · without screenshots</button>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {shots.images === 0
              ? 'You have no screenshots yet, so both kinds are the same.'
              : <>You have <b className="text-fg">{shots.images}</b> screenshot{shots.images === 1 ? '' : 's'} ({formatBytes(shots.bytes)}). A full backup is about <b className="text-fg">{formatBytes(shots.bytes + liteBase)}</b>; a lite one is about <b className="text-fg">{formatBytes(liteBase)}</b> and opens instantly. This choice is used by every backup button and by automatic backups.</>}
          </p>
          {!info.screenshots && shots.images > 0 && <p className="mt-1 text-xs text-warn">⚠ Lite backups do not contain your screenshots. Keep an occasional full backup too.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => doExport()}>Back up now ({info.screenshots ? 'full' : 'lite'})</button>
          <button className="btn-ghost" onClick={() => doExport(!info.screenshots)} disabled={shots.images === 0} title={shots.images === 0 ? 'You have no screenshots, so there is no difference' : 'Download the other kind once, without changing your choice'}>Save a {info.screenshots ? 'lite' : 'full'} copy once</button>
          <button className="btn-ghost" onClick={() => file.current?.click()}>Restore from a backup…</button>
          <button className="btn-ghost" onClick={exportCsv} disabled={rows.length === 0} title="For Excel or Google Sheets. This is not a backup: it can't be restored into the app.">Export trades (CSV)</button>
          <input ref={file} type="file" accept=".zip,.json,application/zip,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }} />
        </div>
        {pending && <ImportDialog parsed={pending.parsed} existing={rows.map((r) => r.trade)} existingReviews={pending.reviews} fileName={pending.name} onConfirm={runImport} onCancel={() => setPending(null)} />}
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
      </div>}
    </div>
  )
}
