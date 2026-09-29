export interface Tick { label: string; value: string; tone?: 'up' | 'down' | 'muted' | 'fg'; arrow?: boolean }

const TONE = { up: 'text-up', down: 'text-down', muted: 'text-muted', fg: 'text-fg' }

export default function Ticker({ items }: { items: Tick[] }) {
  if (!items.length) return null
  const row = (copy: 'a' | 'b') => (
    <div className="flex shrink-0 items-center" aria-hidden={copy === 'b'}>
      {items.map((t, i) => (
        <span key={copy + i} className="flex items-center gap-2 whitespace-nowrap px-5 text-xs">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">{t.label}</span>
          <span className={`num font-semibold ${TONE[t.tone ?? 'fg']}`}>
            {t.arrow && (t.tone === 'up' ? '▲ ' : t.tone === 'down' ? '▼ ' : '')}{t.value}
          </span>
          <span className="ml-3 h-1 w-1 rounded-full bg-line" />
        </span>
      ))}
    </div>
  )
  return (
    <div className="ticker relative overflow-hidden border-b border-line/70 bg-panel/40 py-2 backdrop-blur-xl" role="marquee" aria-label="Performance ticker">
      <div className="ticker-track flex w-max">{row('a')}{row('b')}</div>
    </div>
  )
}
