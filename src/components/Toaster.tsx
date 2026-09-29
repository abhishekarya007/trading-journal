import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { dismissToast, subscribeToasts, type ToastItem } from '../lib/toast'

const ICON = { success: '✓', error: '✕', info: 'i' }
const TONE = { success: 'bg-up/20 text-up', error: 'bg-down/20 text-down', info: 'bg-accent/20 text-accent' }

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => subscribeToasts(setItems), [])
  return createPortal(
    <div className="pointer-events-none fixed bottom-24 right-4 z-[90] flex flex-col items-end gap-2 md:bottom-6 md:right-6" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} role="status" className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line bg-panel/90 py-2.5 pl-4 pr-3 text-sm shadow-2xl backdrop-blur-xl"
          style={{ animation: 'toast-in .25s ease-out both' }}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${TONE[t.tone]}`}>{ICON[t.tone]}</span>
          <span>{t.text}</span>
          {t.action && (
            <button type="button" className="ml-1 rounded-lg border border-accent/40 bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent transition hover:bg-accent/25"
              onClick={() => { dismissToast(t.id); void t.action!.run() }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  )
}
