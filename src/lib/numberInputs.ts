/**
 * Number boxes should only change when you type in them. This stops the scroll wheel from nudging the value of a
 * focused number box (it is un-focused instead, so the page keeps scrolling) and ignores the Up/Down arrow keys there.
 * Time, date, text and slider inputs are left alone.
 */
let installed = false
export function installNumberInputGuards(doc: Document = document) {
  if (installed) return
  installed = true
  const isNumber = (el: unknown): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === 'number'
  doc.addEventListener('wheel', (e) => {
    const active = doc.activeElement
    if (isNumber(active) && e.target === active) active.blur()
  }, { capture: true, passive: true })
  doc.addEventListener('keydown', (e) => {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isNumber(e.target)) e.preventDefault()
  }, true)
}
