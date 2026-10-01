import type { Settings } from './types'

// Defaults are starting points only. Verify against Dhan's current brokerage
// page and NSE/SEBI circulars, then edit in Settings.
export const DEFAULT_SETTINGS: Settings = {
  startingCapital: 100000,
  monthCapital: {},
  setups: ['Breakout', 'Pullback', 'Reversal', 'Gap', 'Trend follow', 'Other'],
  mistakeTags: ['FOMO', 'Revenge trade', 'Moved SL', 'Oversized', 'Early exit', 'No SL'],
  exitMistakes: ['Early exit', 'Moved SL'],
  risk: { dailyLossLimit: 2000, maxConsecutiveLosses: 3, maxTradesPerDay: 10 },
  calculator: { capital: 100000, maxLoss: 1000 },
  goals: { profit: 0, maxLoss: 0 },
  cooldown: { minutes: 15, offerAfterLoss: true, sound: true, notify: false },
  monthGoal: {},
  monthMaxLoss: {},
  rates: {
    intradayBrokerageFlat: 20,
    intradayBrokeragePct: 0.03,
    sttIntradaySellPct: 0.025,
    exchangeTxnPct: 0.00307,
    sebiPct: 0.0001,
    stampIntradayBuyPct: 0.003,
    gstPct: 18,
  },
}

export const EMOTIONS = ['Calm', 'Confident', 'Anxious', 'Greedy', 'Fearful', 'Frustrated', 'Bored']
