const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const IconDashboard = () => <svg {...base}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
export const IconTrades = () => <svg {...base}><path d="M3 17l6-6 4 4 8-9" /><path d="M15 6h6v6" /></svg>
export const IconWeekly = () => <svg {...base}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
export const IconInsights = () => <svg {...base}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
export const IconSettings = () => <svg {...base}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h0a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5h0a1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>
export const IconSun = () => <svg {...base}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
export const IconMoon = () => <svg {...base}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
export const IconLogo = ({ size = 34 }: { size?: number }) => (
  <span className="relative inline-flex shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, background: 'linear-gradient(135deg, var(--accent), var(--accent2))', boxShadow: '0 8px 22px -8px var(--accent)' }}>
    <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 5v4M6 15v4M12 3v3M12 14v7M18 7v3M18 16v3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="4.5" y="9" width="3" height="6" rx="1" fill="#fff" />
      <rect x="10.5" y="6" width="3" height="8" rx="1" fill="#fff" opacity=".85" />
      <rect x="16.5" y="10" width="3" height="6" rx="1" fill="#fff" />
    </svg>
  </span>
)
export const IconSearch = () => <svg {...base}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
export const IconPlus = () => <svg {...base}><path d="M12 5v14M5 12h14" /></svg>
export const IconBolt = () => <svg {...base}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>
export const IconScale = () => <svg {...base}><path d="M12 3v18M5 7h14M5 7l-3 7a4 4 0 006 0L5 7zM19 7l-3 7a4 4 0 006 0l-3-7z" /></svg>
export const IconDown = () => <svg {...base}><path d="M3 7l6 6 4-4 8 8" /><path d="M21 11v6h-6" /></svg>
export const IconWallet = () => <svg {...base}><rect x="3" y="6" width="18" height="14" rx="2.5" /><path d="M16 13h2M3 10h18M6 6l9-3 2 3" /></svg>
export const IconCalc = () => <svg {...base}><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" /></svg>
export const IconReport = () => <svg {...base}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>
const small = { ...base, width: 15, height: 15 }
export const IconEdit = () => <svg {...small}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
export const IconCopy = () => <svg {...small}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" /></svg>
export const IconTrash = () => <svg {...small}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
export const IconChevLeft = () => <svg {...small}><path d="M15 6l-6 6 6 6" /></svg>
export const IconChevRight = () => <svg {...small}><path d="M9 6l6 6-6 6" /></svg>
export const IconTimer = () => <svg {...base}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6M12 2v3" /></svg>
