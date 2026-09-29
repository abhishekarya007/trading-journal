import { useId } from 'react'

const TONES = { up: 'var(--up)', down: 'var(--down)', accent: 'var(--accent)' }

export default function Sparkline({ values, tone = 'accent', height = 36 }: { values: number[]; tone?: keyof typeof TONES; height?: number }) {
  const id = useId().replace(/:/g, '')
  if (values.length < 2) return <div style={{ height }} />
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const line = values
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * 100).toFixed(2)},${(29 - ((v - min) / span) * 26).toFixed(2)}`)
    .join(' ')
  const color = TONES[tone]
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ height, width: '100%', display: 'block' }} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.35 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${line} L100,30 L0,30 Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" style={{ stroke: color }} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
