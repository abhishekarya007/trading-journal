import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'

const DATA_FILE = 'data.json'
const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }
const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

const README = `Trading journal backup
======================

data.json            Your trades, weekly reviews and settings.
screenshots/         Your chart screenshots as normal image files.
                     data.json points to each one by its file name.

To restore: open the app, go to Settings > Backup > "Restore from a backup..."
and choose this .zip file. Keep the files together; do not rename the screenshots.
`

/** "data:image/jpeg;base64,AAAA" -> its bytes and file extension (null if it isn't a base64 image). */
export function dataUrlToFile(url: string): { bytes: Uint8Array; ext: string } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(url)
  if (!m) return null
  try {
    const bin = atob(m[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { bytes, ext: EXT_BY_MIME[m[1].toLowerCase()] ?? 'jpg' }
  } catch { return null }
}

export function bytesToDataUrl(bytes: Uint8Array, ext: string): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${MIME_BY_EXT[ext.toLowerCase()] ?? 'image/jpeg'};base64,${btoa(bin)}`
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 24) || 'trade'

/**
 * Turns the normal backup JSON (screenshots embedded as base64) into a ZIP:
 * data.json holds the data with each screenshot replaced by its file name, and every screenshot is a real image file.
 */
export function jsonToZip(jsonText: string): Uint8Array {
  const data = JSON.parse(jsonText) as { trades?: { date?: string; symbol?: string; screenshots?: string[] }[] }
  const files: Zippable = {}
  ;(data.trades ?? []).forEach((t, i) => {
    if (!Array.isArray(t.screenshots) || !t.screenshots.length) return
    const names: string[] = []
    t.screenshots.forEach((url, n) => {
      const f = typeof url === 'string' ? dataUrlToFile(url) : null
      if (!f) return
      const name = `screenshots/${String(i + 1).padStart(4, '0')}_${safe(t.date ?? '')}_${safe(t.symbol ?? '')}_${n + 1}.${f.ext}`
      files[name] = [f.bytes, { level: 0 }] // JPEGs are already compressed
      names.push(name)
    })
    t.screenshots = names
  })
  files[DATA_FILE] = strToU8(JSON.stringify(data, null, 2))
  files['README.txt'] = strToU8(README)
  return zipSync(files, { level: 6 })
}

/** The reverse: reads a backup ZIP and returns the normal backup JSON text, with the screenshots embedded again. */
export function zipToJson(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>
  try { files = unzipSync(bytes) } catch { throw new Error('This ZIP file could not be opened. It may be damaged or not a ZIP at all.') }
  const dataKey = Object.keys(files).find((k) => k === DATA_FILE || k.endsWith('/' + DATA_FILE))
  if (!dataKey) throw new Error('This ZIP is not a trading-journal backup (it has no data.json).')
  const root = dataKey.slice(0, dataKey.length - DATA_FILE.length) // in case the zip was re-zipped inside a folder
  let data: { trades?: { screenshots?: string[] }[] }
  try { data = JSON.parse(strFromU8(files[dataKey])) } catch { throw new Error('The data.json inside this ZIP could not be read.') }
  for (const t of data.trades ?? []) {
    if (!Array.isArray(t.screenshots)) continue
    t.screenshots = t.screenshots.flatMap((name) => {
      if (typeof name !== 'string') return []
      if (name.startsWith('data:')) return [name] // an embedded image is also fine
      const f = files[root + name] ?? files[name]
      return f ? [bytesToDataUrl(f, name.split('.').pop() ?? 'jpg')] : [] // a missing image file is skipped
    })
  }
  return JSON.stringify(data)
}

/** Reads a chosen backup file (.zip or .json) and returns the backup JSON text. */
export async function readBackupFile(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const isZip = buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 3 || buf[2] === 5) // "PK"
  return isZip ? zipToJson(buf) : new TextDecoder().decode(buf)
}
