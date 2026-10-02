import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Settings, Side } from '../lib/types'
import type { Row } from '../lib/stats'
import { monthlyCapital } from '../lib/capital'
import { dailyLeft, sizeForLoss } from '../lib/positionSize'
import { inr } from '../lib/format'
import { localDate } from '../lib/week'
import { toast } from '../lib/toast'
import PageTitle from '../components/PageTitle'
import CooldownBanner from '../components/CooldownBanner'

interface Props { rows: Row[]; settings: Settings; save: (s: Settings) => void }

const num = (s: string) => { const n = Number(s); return Number.isFinite(n) && s.trim() !== '' ? n : 0 }
const money = (n: number) => inr(n, 2)
const PCT_CHIPS = [0.25, 0.5, 1, 2]

export default function Calculator({ rows, settings, save }: Props) {
  const navigate = useNavigate()
  const [side, setSide] = useState<Side>('Long')
  const [entry, setEntry] = useState('')
  const [stop, setStop] = useState('')
  const [target, setTarget] = useState('')
  const [capital, setCapital] = useState(String(settings.calculator.capital))
  const [loss, setLoss] = useState(String(settings.calculator.maxLoss))
  const [leverage, setLeverage] = useState(settings.calculator.leverage || 1)

  const cap = num(capital)
  const limit = num(loss)
  const pct = cap > 0 ? (limit / cap) * 100 : 0
  const sliderMax = Math.max(5, Math.ceil(pct)) // the thumb always stays on the track, even for a big typed amount

  const res = useMemo(
    // The position can never cost more than your capital (times any leverage your broker gives you).
    () => sizeForLoss({ limit, entry: num(entry), stop: num(stop), target: num(target) || undefined, side, rates: settings.rates, maxValue: cap > 0 ? cap * leverage : undefined }),
    [limit, entry, stop, target, side, settings.rates, cap, leverage],
  )

  const todayNet = useMemo(() => rows.filter((r) => r.trade.date === localDate()).reduce((s, r) => s + r.res.net, 0), [rows])
  const left = dailyLeft(settings.risk.dailyLossLimit, todayNet)
  const monthCap = monthlyCapital(rows, settings, localDate().slice(0, 7)).get(localDate().slice(0, 7))?.capital

  const setLossFromPct = (p: number) => setLoss(String(Math.round((cap * p) / 100)))
  const isDefault = cap === settings.calculator.capital && limit === settings.calculator.maxLoss && leverage === (settings.calculator.leverage || 1)
  const saveDefaults = () => {
    save({ ...settings, calculator: { capital: cap, maxLoss: limit, leverage } })
    toast('Saved as your defaults')
  }
  const resetDefaults = () => { setCapital(String(settings.calculator.capital)); setLoss(String(settings.calculator.maxLoss)); setLeverage(settings.calculator.leverage || 1) }

  const copyQty = async () => {
    if (!res || res.qty < 1) return
    try { await navigator.clipboard.writeText(String(res.qty)); toast(`Quantity ${res.qty} copied`) } catch { toast('Couldn’t copy. Select the number instead.', 'error') }
  }
  const logTrade = () => {
    if (!res || res.qty < 1) return
    navigate('/trades', { state: { prefill: { side, qty: res.qty, entry: num(entry), stop: num(stop), target: num(target) || undefined } } })
  }

  const ready = !!res && !res.wrongSide
  const field = 'input num'

  return (
    <div className="space-y-5">
      <PageTitle title="Position size calculator" sub="Enter your entry and stop-loss. It suggests how many shares keep your loss, charges included, within your limit." />
      <CooldownBanner />

      <div className="grid items-start gap-5 lg:grid-cols-5">
        {/* Inputs */}
        <div className="card space-y-5 lg:col-span-2">
          <div>
            <div className="seg w-full" role="group" aria-label="Trade side">
              {(['Long', 'Short'] as const).map((s) => (
                <button key={s} className="flex-1 !py-2" aria-pressed={side === s} onClick={() => setSide(s)}>{s}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="label" htmlFor="c-entry">Entry price</label>
              <input id="c-entry" className={field} type="number" step="any" min={0} inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="e.g. 100" autoFocus /></div>
            <div><label className="label" htmlFor="c-stop">Stop-loss</label>
              <input id="c-stop" className={field} type="number" step="any" min={0} inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} placeholder="e.g. 98" /></div>
            <div className="col-span-2"><label className="label" htmlFor="c-target">Target (optional)</label>
              <input id="c-target" className={field} type="number" step="any" min={0} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 106" /></div>
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            <div>
              <label className="label" htmlFor="c-capital">Capital (₹)</label>
              <div className="flex items-center gap-2">
                <input id="c-capital" className={field} type="number" min={0} inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} />
                {monthCap !== undefined && monthCap !== cap && (
                  <button type="button" className="btn-ghost shrink-0 !px-2.5 !py-1.5 text-xs" onClick={() => setCapital(String(monthCap))} title="Use the trading capital you set for this month">This month’s</button>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="label !mb-0">Leverage</span>
                <span className="text-xs text-muted">{leverage === 1 ? 'position stays inside your capital' : `position can be up to ${inr(Math.round(cap * leverage))}`}</span>
              </div>
              <div className="seg" role="group" aria-label="Leverage">
                {[1, 2, 3, 5].map((n) => <button key={n} type="button" aria-pressed={leverage === n} onClick={() => setLeverage(n)}>{n}×</button>)}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label className="label !mb-0" htmlFor="c-loss">Most I’ll lose (₹)</label>
                <span className="num text-xs text-muted">{pct.toFixed(2)}% of capital</span>
              </div>
              <input id="c-loss" className={field} type="number" min={0} inputMode="decimal" value={loss} onChange={(e) => setLoss(e.target.value)} />
              <input type="range" aria-label="Loss limit as a share of capital" className="mt-3 w-full accent-[var(--accent)]" min={0.05} max={sliderMax} step={0.05}
                value={Math.min(Math.max(pct, 0.05), sliderMax)} onChange={(e) => setLossFromPct(Number(e.target.value))} />
              <div className="mt-1 flex justify-between text-[10px] text-muted"><span>0.05%</span><span>{sliderMax}%</span></div>
              <div className="mt-2 flex flex-wrap gap-2">
                {PCT_CHIPS.map((p) => (
                  <button key={p} type="button" onClick={() => setLossFromPct(p)}
                    className={`chip transition hover:border-accent/60 ${Math.abs(pct - p) < 0.005 ? '!border-accent !bg-accent/15 !text-fg' : ''}`}>{p}%</button>
                ))}
                {left !== null && left > 0 && left !== limit && (
                  <button type="button" className="chip transition hover:border-accent/60" onClick={() => setLoss(String(Math.round(left)))} title="What is left of today’s daily loss limit">Today’s budget {inr(left)}</button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" className="btn-ghost text-xs" onClick={saveDefaults} disabled={isDefault || cap <= 0 || limit <= 0}>
                {isDefault ? '✓ These are your defaults' : 'Save capital & loss as defaults'}
              </button>
              {!isDefault && <button type="button" className="text-xs text-accent hover:underline" onClick={resetDefaults}>Reset to defaults</button>}
            </div>
          </div>
        </div>

        {/* Result */}
        <div className="card space-y-5 lg:col-span-3">
          {!res ? (
            <div className="py-16 text-center text-sm text-muted">Enter an entry price and a stop-loss to see how many shares to take.</div>
          ) : res.wrongSide ? (
            <div className="py-16 text-center text-sm text-warn">⚠ For a {side.toLowerCase()} trade the stop-loss should be {side === 'Long' ? 'below' : 'above'} the entry price.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="label">Suggested quantity</div>
                  <div className="num text-6xl font-semibold tracking-tight text-gradient" aria-live="polite">{res.qty}</div>
                  <div className="mt-1 text-xs text-muted">shares · position {inr(res.positionValue)}{cap > 0 && <> ({(res.positionValue / cap).toFixed(2)}× capital)</>}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost" onClick={copyQty} disabled={res.qty < 1}>Copy quantity</button>
                  <button type="button" className="btn" onClick={logTrade} disabled={res.qty < 1}>Log this trade →</button>
                </div>
              </div>

              {res.cappedByCapital && (
                <p className="rounded-xl border border-accent/40 bg-accent/10 px-3.5 py-2.5 text-sm">
                  Limited by your capital. Your risk limit alone would allow <b className="num">{res.riskQty}</b> shares ({inr(Math.round(res.riskQty * num(entry)))}), but only <b className="num">{res.maxQty}</b> fit in {leverage === 1 ? 'your capital' : `${inr(Math.round(cap * leverage))} (${leverage}× leverage)`}.
                  So you risk only <b className="num">{inr(Math.round(res.loss))}</b> here, less than your limit.{leverage === 1 && <> If your broker gives intraday leverage, set it above.</>}
                </p>
              )}

              {res.qty < 1 && <p className="rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-sm">{res.cappedByCapital || (res.maxQty === 0 && res.riskQty > 0) ? '⚠ A single share costs more than your capital. Raise the capital or leverage.' : '⚠ Even a single share would lose more than your limit at this stop-loss. Raise the limit or tighten the stop.'}</p>}

              {res.qty > 0 && (
                <div className="rounded-xl border border-down/30 bg-down/5 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="label !mb-0">If your stop-loss is hit</span>
                    <span className="num text-2xl font-semibold text-down">-{money(res.loss)}</span>
                  </div>
                  <table className="mt-3 w-full text-sm">
                    <tbody>
                      <tr><td className="py-1 text-muted">Price move ({res.qty} × {money(res.perShare)})</td><td className="num py-1 text-right">-{money(res.priceLoss)}</td></tr>
                      {([['Brokerage', res.atStop.charges.brokerage], ['STT', res.atStop.charges.stt], ['Exchange charges', res.atStop.charges.exchange], ['SEBI fee', res.atStop.charges.sebi], ['Stamp duty', res.atStop.charges.stamp], ['GST', res.atStop.charges.gst]] as const).map(([k, v]) => (
                        <tr key={k}><td className="py-0.5 pl-4 text-xs text-muted">{k}</td><td className="num py-0.5 text-right text-xs text-muted">-{money(v)}</td></tr>
                      ))}
                      <tr className="border-t border-line"><td className="pt-2 font-semibold">Total charges</td><td className="num pt-2 text-right font-semibold">-{money(res.atStop.charges.total)}</td></tr>
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-muted">
                    That is <b className="num text-fg">{cap > 0 ? ((res.loss / cap) * 100).toFixed(2) : '0.00'}%</b> of your capital and <b className="num text-fg">{limit > 0 ? ((res.loss / limit) * 100).toFixed(0) : 0}%</b> of your limit.
                    The quantity is rounded down so the loss never goes above {inr(limit)}.
                  </p>
                </div>
              )}

              {res.qty > 0 && res.atTarget && (
                <div className="rounded-xl border border-up/30 bg-up/5 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="label !mb-0">If your target is hit</span>
                    <span className="num text-2xl font-semibold text-up">+{money(res.atTarget.net)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {money(res.atTarget.gross)} before charges, {money(res.atTarget.charges.total)} of charges.
                    Reward : risk is <b className="num text-fg">{res.atTarget.priceRR.toFixed(2)} : 1</b> on price alone
                    {res.atTarget.netRR !== null && <> and <b className="num text-fg">{res.atTarget.netRR.toFixed(2)} : 1</b> after charges</>}.
                  </p>
                </div>
              )}

              {res.qty > 0 && left !== null && (
                <p className={`text-xs ${res.loss > left ? 'text-warn' : 'text-muted'}`}>
                  {res.loss > left
                    ? `⚠ Today you have ${inr(left)} left of your ${inr(settings.risk.dailyLossLimit)} daily loss limit, and this trade could lose ${inr(res.loss)}.`
                    : `Today you have ${inr(left)} left of your ${inr(settings.risk.dailyLossLimit)} daily loss limit.`}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Phones: keep the answer in view while you adjust the inputs above it */}
      {ready && res && (
        <div className="fixed inset-x-3 bottom-[4.6rem] z-20 flex items-center justify-between rounded-2xl border border-line bg-panel/95 px-4 py-2.5 shadow-2xl backdrop-blur-xl lg:hidden" aria-hidden="true">
          <div><div className="label !mb-0">Quantity</div><div className="num text-2xl font-semibold">{res.qty}</div></div>
          <div className="text-right"><div className="label !mb-0">Loss at stop-loss</div><div className="num text-lg font-semibold text-down">{res.qty > 0 ? `-${money(res.loss)}` : '–'}</div></div>
        </div>
      )}
    </div>
  )
}
