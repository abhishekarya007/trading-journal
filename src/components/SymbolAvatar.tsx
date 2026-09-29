const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export default function SymbolAvatar({ symbol, size = 34 }: { symbol: string; size?: number }) {
  const h = hue(symbol)
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-xl font-display text-[11px] font-bold text-white"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${h} 75% 58%), hsl(${(h + 45) % 360} 70% 42%))`, boxShadow: `0 6px 16px -8px hsl(${h} 80% 50%)` }}>
      {symbol.slice(0, 2)}
    </span>
  )
}
