// Recharts needs literal colours (CSS vars aren't reliable in SVG attributes).
export const COLORS = {
  up: '#22d39a', down: '#ff5c7a', accent: '#5b8cff', accent2: '#a78bfa',
  axis: '#8a94ab', grid: 'rgba(138,148,171,0.13)',
}

export const tooltipStyle = {
  contentStyle: {
    background: 'color-mix(in srgb, var(--panel2) 94%, transparent)', border: '1px solid var(--line)', borderRadius: 12,
    color: 'var(--fg)', fontSize: 12, boxShadow: '0 16px 40px -12px rgba(0,0,0,.55)', backdropFilter: 'blur(10px)',
  },
  labelStyle: { color: 'var(--muted)', marginBottom: 2 },
  itemStyle: { color: 'var(--fg)', fontFamily: 'JetBrains Mono, monospace' },
  cursor: { fill: 'rgba(138,148,171,0.08)' },
}
export const axisTick = { fontSize: 11, fill: COLORS.axis }
