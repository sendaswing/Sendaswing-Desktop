import { ipcMain, app } from 'electron'
import { spawn } from 'child_process'
import { createWriteStream, mkdirSync, readdirSync, existsSync, unlinkSync, renameSync, copyFileSync } from 'fs'
import { join } from 'path'
import type { WriteStream } from 'fs'
import { getRecordingsDir } from './settings'
import { ffmpegPath, probe } from './convert'

interface RecordingSession {
  stream: WriteStream
  filename: string
  cameraLabel: string
  cameraAngle: string
  club: string
  startTime: number
  /** Where the bytes are being written (a temp file when a flip is pending). */
  path: string
  /** Final location in the recordings folder. Same as `path` when no flip. */
  finalPath: string
  flipH: boolean
  flipV: boolean
  fps: number
}

const sessions = new Map<string, RecordingSession>()

/** Today's date as MM.DD.YYYY — the prefix used by every recorded/imported clip. */
export function todayDateStr(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${mm}.${dd}.${now.getFullYear()}`
}

/**
 * Next unused swing number for today in the recordings folder.
 * Files are named MM.DD.YYYY.Angle.N.(mp4|webm); shared by capture and import.
 */
export function nextSwingNumber(): number {
  const dir = getRecordingsDir()
  let entries: string[] = []
  try {
    mkdirSync(dir, { recursive: true })
    entries = readdirSync(dir)
  } catch {
    return 1
  }

  const prefix = todayDateStr().replace(/\./g, '\\.')
  const pattern = new RegExp(`^${prefix}\\.\\w+\\.(\\d+)\\.(mp4|webm)$`)
  let max = 0
  for (const name of entries) {
    const m = name.match(pattern)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

/**
 * Flip a raw Standard-mode recording with ffmpeg and write it in the studio
 * format (all-intra H.264, CFR, no audio) — the same encode Buffered mode uses,
 * so the clip also scrubs instantly in Analyze.
 */
function flipToStudio(src: string, dest: string, flipH: boolean, flipV: boolean, fps: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const filters = [
    ...(flipH ? ['hflip'] : []),
    ...(flipV ? ['vflip'] : []),
    'scale=trunc(iw/2)*2:trunc(ih/2)*2'
  ]
  const args = [
    '-hide_banner', '-nostats', '-y',
    '-i', src,
    '-an',
    '-vf', filters.join(','),
    '-fps_mode', 'cfr',
    '-r', String(fps),
    '-c:v', 'libx264',
    '-preset', 'superfast',
    '-crf', '19',
    '-g', '1', '-keyint_min', '1',
    '-x264-params', 'keyint=1:min-keyint=1:scenecut=0',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    dest
  ]
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(ffmpegPath(), args, { windowsHide: true })
    } catch (err) {
      resolve({ ok: false, error: String(err) })
      return
    }
    let stderrTail = ''
    child.stderr?.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-4000) })
    child.on('error', (err) => resolve({ ok: false, error: `ffmpeg could not start: ${err.message}` }))
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: `ffmpeg exited with code ${code}\n${stderrTail.split('\n').slice(-6).join('\n')}` })
    })
  })
}

export function registerRecordingHandlers(): void {
  ipcMain.handle('recording:next-swing-number', () => nextSwingNumber())

  ipcMain.handle('recording:init', (_event, { filename, cameraLabel, cameraAngle, club, flipH, flipV, fps }: { filename: string; cameraLabel: string; cameraAngle: string; club: string; flipH?: boolean; flipV?: boolean; fps?: number }) => {
    const dir = getRecordingsDir()
    mkdirSync(dir, { recursive: true })

    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const flip = !!(flipH || flipV)

    // A flipped recording is written raw to a temp file first; finalize flips it
    // into the recordings folder as an .mp4.
    const finalName = flip ? filename.replace(/\.(webm|mp4)$/i, '') + '.mp4' : filename
    const finalPath = join(dir, finalName)
    let filePath = finalPath
    if (flip) {
      const tmpDir = join(app.getPath('temp'), 'sendaswing-standard')
      mkdirSync(tmpDir, { recursive: true })
      const ext = filename.match(/\.(webm|mp4)$/i)?.[1] ?? 'webm'
      filePath = join(tmpDir, `rec-${sessionId}.${ext}`)
    }
    const stream = createWriteStream(filePath)

    sessions.set(sessionId, {
      stream,
      filename: finalName,
      cameraLabel,
      cameraAngle: cameraAngle ?? '',
      club: club ?? '',
      startTime: Date.now(),
      path: filePath,
      finalPath,
      flipH: !!flipH,
      flipV: !!flipV,
      fps: fps && fps > 0 && fps <= 480 ? Math.round(fps) : 60
    })

    return sessionId
  })

  ipcMain.handle('recording:chunk', (_event, { sessionId, chunk }: { sessionId: string; chunk: Uint8Array }) => {
    const session = sessions.get(sessionId)
    if (!session) return false
    session.stream.write(Buffer.from(chunk))
    return true
  })

  ipcMain.handle('recording:finalize', (_event, { sessionId }: { sessionId: string }) => {
    const session = sessions.get(sessionId)
    if (!session) return null

    return new Promise((resolve) => {
      session.stream.end(async () => {
        sessions.delete(sessionId)
        let duration = (Date.now() - session.startTime) / 1000
        let fps = 30

        if (session.flipH || session.flipV) {
          const result = await flipToStudio(session.path, session.finalPath, session.flipH, session.flipV, session.fps)
          if (result.ok) {
            try { unlinkSync(session.path) } catch { /* ignore */ }
            const out = await probe(session.finalPath).catch(() => null)
            fps = out?.fps || session.fps
            duration = out?.duration || duration
          } else {
            // Don't lose the swing: keep the unflipped raw recording instead.
            console.error('[recording] flip failed, keeping unflipped file:', result.error)
            try { if (existsSync(session.finalPath)) unlinkSync(session.finalPath) } catch { /* ignore */ }
            const ext = session.path.split('.').pop()
            const fallback = session.finalPath.replace(/\.mp4$/i, '') + '.' + ext
            try {
              try { renameSync(session.path, fallback) } catch { copyFileSync(session.path, fallback); unlinkSync(session.path) }
              session.finalPath = fallback
              session.filename = fallback.split(/[\\/]/).pop()!
            } catch (err) {
              console.error('[recording] could not move raw recording:', err)
              session.finalPath = session.path
            }
          }
        }

        resolve({
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: session.filename,
          filePath: session.finalPath,
          duration,
          fps,
          frameCount: Math.round(duration * fps),
          thumbnailPath: null,
          recordedAt: new Date().toISOString(),
          cameraLabel: session.cameraLabel,
          cameraAngle: session.cameraAngle,
          club: session.club,
          tags: [],
          annotations: []
        })
      })
    })
  })
}
