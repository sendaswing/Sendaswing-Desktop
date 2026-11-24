/**
 * Turns the flat list of files in the recordings folder into days → swings for
 * the Home screen. Understands both naming schemes:
 *
 *   today:   Recordings/MM.DD.YYYY.FO.3.mp4            (date + angle + swing number)
 *   planned: Recordings/<date>/<Player>/FO.3.mp4        (ROADMAP 3b session folders)
 *            Recordings/<date>/import.01.mp4
 *
 * Every clip that shares a day, a player and a swing number is one swing (FO + DL
 * from a two-camera capture). Anything we can't parse becomes a swing of its own,
 * dated by the file's modified time.
 */
import type { CameraAngle, Clip } from '../../types/clip'

export interface RecordingFile {
  name: string
  filePath: string
  /** Folders between the recordings folder and the file. */
  relDir: string[]
  mtimeMs: number
}

export interface Swing {
  key: string
  dayKey: string
  /** Player folder name, or null when the swing was captured with no player set. */
  player: string | null
  label: string
  /** Face-on first, then down-the-line, then anything else. */
  clips: Clip[]
  /** Newest file time in this swing (ms). */
  time: number
}

export interface Day {
  /** Local date as YYYY-MM-DD. */
  dayKey: string
  date: Date
  swings: Swing[]
  clipCount: number
}

const OLD_NAME = /^(\d{2})\.(\d{2})\.(\d{4})\.([A-Za-z]+)\.(\d+)\.[A-Za-z0-9]+$/
const NEW_NAME = /^([A-Za-z]+)\.(\d+)\.[A-Za-z0-9]+$/
const ISO_FOLDER = /^(\d{4})-(\d{2})-(\d{2})$/
const US_FOLDER = /^(\d{2})\.(\d{2})\.(\d{4})$/

const ANGLE_ORDER: Record<string, number> = { FO: 0, DL: 1, Other: 2, '': 3 }

export function dayKeyOf(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function validDate(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

/** A date folder in either format still being decided (ROADMAP D1). */
function parseDateFolder(name: string): Date | null {
  let m = name.match(ISO_FOLDER)
  if (m) return validDate(+m[1], +m[2], +m[3])
  m = name.match(US_FOLDER)
  if (m) return validDate(+m[3], +m[1], +m[2])
  return null
}

function toAngle(raw: string): CameraAngle {
  const up = raw.toUpperCase()
  if (up === 'FO' || up === 'DL') return up
  return raw ? 'Other' : ''
}

interface Parsed {
  date: Date
  player: string | null
  angle: CameraAngle
  number: number | null
  isImport: boolean
}

export function parseRecording(f: RecordingFile): Parsed {
  let date: Date | null = null
  let angleRaw = ''
  let number: number | null = null

  const old = f.name.match(OLD_NAME)
  if (old) {
    date = validDate(+old[3], +old[1], +old[2])
    angleRaw = old[4]
    number = parseInt(old[5], 10)
  } else {
    const n = f.name.match(NEW_NAME)
    if (n) {
      angleRaw = n[1]
      number = parseInt(n[2], 10)
    }
  }

  // Folders: a date folder sets the day; any other folder is the player
  let player: string | null = null
  for (const dir of f.relDir) {
    const d = parseDateFolder(dir)
    if (d) date = date ?? d
    else player = dir
  }

  const isImport = angleRaw.toLowerCase() === 'import'
  return {
    date: date ?? new Date(f.mtimeMs),
    player,
    angle: isImport ? '' : toAngle(angleRaw),
    number,
    isImport
  }
}

export function toClip(f: RecordingFile, angle: CameraAngle, player: string | null): Clip {
  return {
    id: `rec-${f.filePath}`,
    name: f.name,
    filePath: f.filePath,
    duration: 0,
    fps: 30,
    frameCount: 0,
    thumbnailPath: null,
    recordedAt: new Date(f.mtimeMs).toISOString(),
    cameraLabel: player ?? 'Recordings',
    cameraAngle: angle,
    club: '',
    tags: [],
    annotations: []
  }
}

/** Group recordings into days (newest first), each with its swings (newest first). */
export function groupDays(files: RecordingFile[]): Day[] {
  const swings = new Map<string, Swing>()
  const days = new Map<string, Day>()

  for (const f of files) {
    const p = parseRecording(f)
    const dayKey = dayKeyOf(p.date)
    if (!days.has(dayKey)) {
      const [y, m, d] = dayKey.split('-').map(Number)
      days.set(dayKey, { dayKey, date: new Date(y, m - 1, d), swings: [], clipCount: 0 })
    }

    const pairable = p.number !== null && !p.isImport
    const key = pairable ? `${dayKey}|${p.player ?? ''}|${p.number}` : `${dayKey}|file|${f.filePath}`
    let swing = swings.get(key)
    if (!swing) {
      const label =
        p.isImport && p.number !== null ? `Import ${String(p.number).padStart(2, '0')}`
        : p.number !== null ? `Swing ${p.number}`
        : f.name.replace(/\.[^.]+$/, '')
      swing = { key, dayKey, player: p.player, label, clips: [], time: 0 }
      swings.set(key, swing)
      days.get(dayKey)!.swings.push(swing)
    }
    swing.clips.push(toClip(f, p.angle, p.player))
    swing.time = Math.max(swing.time, f.mtimeMs)
    days.get(dayKey)!.clipCount++
  }

  for (const s of swings.values()) {
    s.clips.sort((a, b) => (ANGLE_ORDER[a.cameraAngle] ?? 3) - (ANGLE_ORDER[b.cameraAngle] ?? 3))
  }
  const out = [...days.values()]
  for (const d of out) d.swings.sort((a, b) => b.time - a.time)
  out.sort((a, b) => (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0))
  return out
}

/** Split a day's swings by player; the player with the newest swing comes first. */
export function groupByPlayer(swings: Swing[]): Array<{ player: string | null; swings: Swing[] }> {
  const groups = new Map<string, { player: string | null; swings: Swing[] }>()
  for (const s of swings) {
    const k = s.player ?? ''
    if (!groups.has(k)) groups.set(k, { player: s.player, swings: [] })
    groups.get(k)!.swings.push(s)
  }
  // swings arrive newest first, so each group's first swing is its newest
  return [...groups.values()].sort((a, b) => b.swings[0].time - a.swings[0].time)
}
