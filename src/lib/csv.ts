import type { Row } from './stats'

const HEADERS = [
  'Date', 'Symbol', 'Side', 'Quantity', 'Entry time', 'Exit time', 'Entry price', 'Exit price', 'Stop-loss', 'Target',
  'Gross P&L', 'Brokerage', 'STT', 'Exchange charges', 'SEBI fee', 'Stamp duty', 'GST', 'Total charges', 'Net P&L',
  'Return %', 'R multiple', 'Setup', 'Emotion', 'Confidence', 'Followed plan', 'Mistakes', 'Notes',
]

/** Text cells that start with = + - @ would run as a formula in Excel, so they get a leading apostrophe. */
const safeText = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s)

const cell = (v: string | number | undefined | null, isText = false) => {
  if (v === undefined || v === null) return ''
  const s = isText ? safeText(String(v)) : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** All trades as CSV: UTF-8 with a BOM and CRLF lines so Excel opens it correctly, ₹ and accents included. */
export function tradesToCsv(rows: Row[]): string {
  const lines = [HEADERS.map((h) => cell(h)).join(',')]
  for (const { trade: t, res } of rows) {
    const c = res.charges
    lines.push([
      cell(t.date), cell(t.symbol, true), cell(t.side), cell(t.qty), cell(t.entryTime), cell(t.exitTime), cell(t.entryPrice), cell(t.exitPrice), cell(t.stopLoss), cell(t.target),
      cell(res.gross), cell(c.brokerage), cell(c.stt), cell(c.exchange), cell(c.sebi), cell(c.stamp), cell(c.gst), cell(c.total), cell(res.net),
      cell(res.returnPct), cell(res.rMultiple), cell(t.setup, true), cell(t.emotion, true), cell(t.confidence), cell(t.followedPlan ? 'Yes' : 'No'),
      cell(t.mistakes.join('; '), true), cell(t.notes, true),
    ].join(','))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
