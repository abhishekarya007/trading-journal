import { describe, expect, it } from 'vitest'
import { clampPage, pageCount, pageSlice, pageWindow, rangeText } from './paginate'

describe('paging', () => {
  const items = Array.from({ length: 99 }, (_, i) => i + 1)
  it('counts pages, never fewer than one', () => {
    expect(pageCount(99, 25)).toBe(4)
    expect(pageCount(100, 25)).toBe(4)
    expect(pageCount(101, 25)).toBe(5)
    expect(pageCount(0, 25)).toBe(1)
  })
  it('slices a page and the short last page', () => {
    expect(pageSlice(items, 1, 25)).toEqual(items.slice(0, 25))
    expect(pageSlice(items, 4, 25)).toEqual([76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99])
  })
  it('pulls a page that no longer exists back to a real one (e.g. after deleting trades)', () => {
    expect(clampPage(9, 99, 25)).toBe(4)
    expect(clampPage(0, 99, 25)).toBe(1)
    expect(pageSlice(items, 9, 25)).toEqual(pageSlice(items, 4, 25))
    expect(pageSlice([], 3, 25)).toEqual([])
  })
  it('describes the range', () => {
    expect(rangeText(1, 99, 25)).toBe('1–25 of 99')
    expect(rangeText(4, 99, 25)).toBe('76–99 of 99')
    expect(rangeText(1, 0, 25)).toBe('0 of 0')
  })
})

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4])
    expect(pageWindow(1, 1)).toEqual([1])
  })
  it('collapses long runs with an ellipsis and keeps the ends and the neighbours', () => {
    expect(pageWindow(1, 12)).toEqual([1, 2, '…', 12])
    expect(pageWindow(6, 12)).toEqual([1, '…', 5, 6, 7, '…', 12])
    expect(pageWindow(12, 12)).toEqual([1, '…', 11, 12])
  })
  it('does not hide a single page behind an ellipsis', () => {
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})
