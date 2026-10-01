import { useEffect, useRef, useState } from 'react'

/** 'flash-up' or 'flash-down' for a moment after `value` changes (never on first render), else ''. Used for a glow on live totals. */
export function useFlash(value: number, ms = 1000): '' | 'flash-up' | 'flash-down' {
  const prev = useRef(value)
  const [cls, setCls] = useState<'' | 'flash-up' | 'flash-down'>('')
  useEffect(() => {
    if (value === prev.current) return
    const up = value > prev.current
    prev.current = value
    setCls(up ? 'flash-up' : 'flash-down')
    const id = setTimeout(() => setCls(''), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return cls
}
