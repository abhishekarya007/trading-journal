// Recharts needs literal colours (CSS vars aren't reliable in SVG attributes).
export const COLORS = { up: '#1fd18b', down: '#ff5d73', accent: '#4f8cff', axis: '#8791a7', grid: 'rgba(135,145,167,0.18)' }

export const tooltipStyle = {
  contentStyle: {
    background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--fg)', fontSize: 12,
    boxShadow: '0 10px 30px -10px rgba(0,0,0,.5)',
  },
  labelStyle: { color: 'var(--muted)' },
  itemStyle: { color: 'var(--fg)' },
  cursor: { fill: 'rgba(135,145,167,0.10)' },
}
export const axisTick = { fontSize: 11, fill: COLORS.axis }
