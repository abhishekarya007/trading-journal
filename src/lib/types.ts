import type { Rule } from './rulebook'
export type Side = 'Long' | 'Short'

export interface Trade {
  id?: number
  date: string // YYYY-MM-DD
  symbol: string
  side: Side
  qty: number
  entryPrice: number
  exitPrice: number
  stopLoss?: number
  target?: number
  entryTime?: string // HH:MM, optional
  exitTime?: string // HH:MM, optional
  setup: string
  emotion: string
  followedPlan: boolean
  confidence?: number // optional 1-5 rating of how sure you were before entering
  mistakes: string[]
  notes: string
  screenshots?: string[] // downscaled JPEG data URLs
}

export interface RiskRules {
  dailyLossLimit: number // ₹, 0 = off
  maxConsecutiveLosses: number // 0 = off
  maxTradesPerDay: number // 0 = off
}

export interface ChargeRates {
  intradayBrokerageFlat: number // ₹ per order cap
  intradayBrokeragePct: number // % of turnover per order
  sttIntradaySellPct: number // % on sell
  exchangeTxnPct: number // % of turnover
  sebiPct: number // % of turnover
  stampIntradayBuyPct: number
  gstPct: number
}

export interface Settings {
  startingCapital: number // default monthly trading capital, used until a month has its own amount
  monthCapital: Record<string, number> // fixed trading capital per month, keyed YYYY-MM
  setups: string[]
  mistakeTags: string[]
  exitMistakes: string[] // subset of mistakeTags about leaving a trade (not priced as 'skip the trade')
  rates: ChargeRates
  risk: RiskRules
  calculator: { capital: number; maxLoss: number; leverage: number } // defaults for the Calculator page (₹)
  goals: { profit: number; maxLoss: number } // default monthly profit goal and loss limit in ₹ (0 = off)
  cooldown: { minutes: number; offerAfterLoss: boolean; sound: boolean; notify: boolean } // the break timer after a stop-loss
  checklist: { items: string[] } // the questions on the pre-trade checklist (opened with Z)
  rulebook: { rules: Rule[] } // your trading rules, checked against every trade automatically
  monthGoal: Record<string, number> // profit goal typed for a month (YYYY-MM)
  monthMaxLoss: Record<string, number> // loss limit typed for a month (YYYY-MM)
}

export interface ChargeBreakdown {
  brokerage: number
  stt: number
  exchange: number
  sebi: number
  stamp: number
  gst: number
  total: number
}

export interface TradeResult {
  gross: number
  charges: ChargeBreakdown
  net: number
  rMultiple: number | null
  returnPct: number
}

export interface WeeklyReview {
  weekStart: string // Monday, YYYY-MM-DD (primary key)
  wentWell: string
  improve: string
  focus: string // focus for next week
}
