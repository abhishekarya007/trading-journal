import type { ChargeRates, ChargeBreakdown, Trade, TradeResult } from './types'

const r2 = (n: number) => Math.round(n * 100) / 100

export function calcCharges(t: Trade, rates: ChargeRates): ChargeBreakdown {
  const long = t.side === 'Long'
  const buyPrice = long ? t.entryPrice : t.exitPrice
  const sellPrice = long ? t.exitPrice : t.entryPrice
  const buyTurnover = buyPrice * t.qty
  const sellTurnover = sellPrice * t.qty
  const turnover = buyTurnover + sellTurnover

  const orderBrokerage = (orderValue: number) =>
    Math.min(rates.intradayBrokerageFlat, (orderValue * rates.intradayBrokeragePct) / 100)
  const brokerage = orderBrokerage(buyTurnover) + orderBrokerage(sellTurnover)

  const stt = (sellTurnover * rates.sttIntradaySellPct) / 100
  const exchange = (turnover * rates.exchangeTxnPct) / 100
  const sebi = (turnover * rates.sebiPct) / 100
  const stamp = (buyTurnover * rates.stampIntradayBuyPct) / 100
  const gst = ((brokerage + exchange + sebi) * rates.gstPct) / 100

  const total = brokerage + stt + exchange + sebi + stamp + gst
  return {
    brokerage: r2(brokerage),
    stt: r2(stt),
    exchange: r2(exchange),
    sebi: r2(sebi),
    stamp: r2(stamp),
    gst: r2(gst),
    total: r2(total),
  }
}

export function calcTrade(t: Trade, rates: ChargeRates): TradeResult {
  const dir = t.side === 'Long' ? 1 : -1
  const gross = r2((t.exitPrice - t.entryPrice) * t.qty * dir)
  const charges = calcCharges(t, rates)
  const net = r2(gross - charges.total)
  const risk = t.stopLoss ? Math.abs(t.entryPrice - t.stopLoss) * t.qty : 0
  const rMultiple = risk > 0 ? r2(net / risk) : null
  const invested = t.entryPrice * t.qty
  const returnPct = invested > 0 ? r2((net / invested) * 100) : 0
  return { gross, charges, net, rMultiple, returnPct }
}
