export type ToastTone = 'success' | 'error' | 'info'
export interface ToastAction { label: string; run: () => void | Promise<void> }
export interface ToastItem { id: number; text: string; tone: ToastTone; action?: ToastAction }

let items: ToastItem[] = []
let seq = 0
const listeners = new Set<(t: ToastItem[]) => void>()
const emit = () => listeners.forEach((fn) => fn(items))

export function dismissToast(id: number) {
  items = items.filter((x) => x.id !== id)
  emit()
}

/** Show a message. A toast with an action (e.g. Undo) stays longer so there's time to use it. */
export function toast(text: string, tone: ToastTone = 'success', opts: { action?: ToastAction; duration?: number } = {}) {
  const t: ToastItem = { id: ++seq, text, tone, action: opts.action }
  items = [...items, t].slice(-4)
  emit()
  setTimeout(() => dismissToast(t.id), opts.duration ?? (opts.action ? 7000 : 2800))
  return t.id
}

export function subscribeToasts(fn: (t: ToastItem[]) => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
