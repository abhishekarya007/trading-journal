export type ToastTone = 'success' | 'error' | 'info'
export interface ToastItem { id: number; text: string; tone: ToastTone }

let items: ToastItem[] = []
let seq = 0
const listeners = new Set<(t: ToastItem[]) => void>()
const emit = () => listeners.forEach((fn) => fn(items))

export function toast(text: string, tone: ToastTone = 'success') {
  const t = { id: ++seq, text, tone }
  items = [...items, t].slice(-4)
  emit()
  setTimeout(() => { items = items.filter((x) => x.id !== t.id); emit() }, 2800)
}

export function subscribeToasts(fn: (t: ToastItem[]) => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
