/**
 * Buffered (pre-roll) capture — main-process side.
 *
 * The renderer keeps a rolling window of camera video in memory. When a swing
 * is triggered (sound on the trigger mic, or the Save Swing hotkey) it hands us
 * the raw MediaRecorder segment plus where the swing sits inside it. We:
 *   1. write the segment to a temp file,
 *   2. cut [pre-roll .. post-roll] around the trigger with ffmpeg and encode it
 *      straight to the studio format (all-intra H.264, CFR, no audio) so the
 *      clip scrubs instantly in Analyze,
 *   3. save it in the recordings folder as MM.DD.YYYY.<Angle>.<N>.mp4,
 *   4. delete the temp file and return a Clip.
 */
import { ipcMain, app } from 'electron'
import { spawn } from 'child_process'
import { mkdirSync, existsSync, unlinkSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getRecordingsDir } from './settings'
import { todayDateStr } from './recording'
import { ffmpegPath, probe } from './convert'

export interface SaveBufferedRequest {
  data: Uint8Array
  ext: 'mp4' | 'webm'
  /** Seconds into the segment where the saved clip should start. */
  startSec: number
  /** Length of the saved clip in seconds. */
  durationSec: number
  /** Frame rate reported by the camera track (MediaRecorder files often lack a usable one). */
  fps: number
  swingNumber: number
  cameraAngle: string
  cameraLabel: string
  club: string
}

function outputPathFor(cameraAngle: string, swingNumber: number): string {
  const dir = getRecordingsDir()
  mkdirSync(dir, { recursive: true })
  const angle = (cameraAngle || 'Other').replace(/[^A-Za-z0-9]/g, '') || 'Other'
  let n = Math.max(1, swingNumber)
  let p = join(dir, `${todayDateStr()}.${angle}.${n}.mp4`)
  while (existsSync(p)) {
    n++
    p = join(dir, `${todayDateStr()}.${angle}.${n}.mp4`)
  }
  return p
}

function runFfmpeg(args: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
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

export function registerBufferedCaptureHandlers(): void {
  ipcMain.handle('capture:save-buffered', async (_e, req: SaveBufferedRequest) => {
    const tmpDir = join(app.getPath('temp'), 'sendaswing-buffer')
    mkdirSync(tmpDir, { recursive: true })
    const tmpPath = join(tmpDir, `seg-${Date.now()}-${Math.random().toString(36).slice(2)}.${req.ext}`)
    const outPath = outputPathFor(req.cameraAngle, req.swingNumber)

    try {
      await writeFile(tmpPath, Buffer.from(req.data))

      const fps = req.fps > 0 && req.fps <= 480 ? Math.round(req.fps) : 60
      const start = Math.max(0, req.startSec)
      const duration = Math.max(0.1, req.durationSec)

      const args = [
        '-hide_banner', '-nostats', '-y',
        // Decode-accurate seek to the pre-roll point, then encode exactly `duration`
        '-ss', start.toFixed(3),
        '-i', tmpPath,
        '-t', duration.toFixed(3),
        '-an',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-fps_mode', 'cfr',
        '-r', String(fps),
        '-c:v', 'libx264',
        // Speed matters here: the golfer is waiting to see the replay
        '-preset', 'superfast',
        '-crf', '19',
        // All-intra (studio format) so the replay scrubs instantly
        '-g', '1', '-keyint_min', '1',
        '-x264-params', 'keyint=1:min-keyint=1:scenecut=0',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outPath
      ]

      const result = await runFfmpeg(args)
      if (!result.ok) {
        try { if (existsSync(outPath)) unlinkSync(outPath) } catch { /* ignore */ }
        return { ok: false, error: result.error }
      }

      const out = await probe(outPath).catch(() => null)
      const outFps = out?.fps || fps
      const outDuration = out?.duration || duration
      return {
        ok: true,
        clip: {
          id: `buf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: outPath.split(/[\\/]/).pop()!,
          filePath: outPath,
          duration: outDuration,
          fps: outFps,
          frameCount: Math.round(outDuration * outFps),
          thumbnailPath: null,
          recordedAt: new Date().toISOString(),
          cameraLabel: req.cameraLabel,
          cameraAngle: req.cameraAngle,
          club: req.club,
          tags: [],
          annotations: []
        }
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    } finally {
      try { if (existsSync(tmpPath)) unlinkSync(tmpPath) } catch { /* ignore */ }
    }
  })
}
