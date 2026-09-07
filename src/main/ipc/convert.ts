/**
 * Import & convert  turns any client video into a scrub-optimized MP4.
 *
 * Output format ("SaS studio format"):
 *   - H.264, EVERY frame a keyframe (all-intra), so any frame decodes on its own
 *     in a few ms and scrubbing is instant in either direction
 *   - constant frame rate at the source's native rate
 *   - capped resolution (720p / 1080p / original), even dimensions
 *   - no audio, faststart so the header is at the front
 *
 * Runs the bundled ffmpeg/ffprobe binaries (ffmpeg-static, ffprobe-static).
 */
import { ipcMain, type BrowserWindow } from 'electron'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { mkdirSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { getRecordingsDir } from './settings'
import { nextSwingNumber, todayDateStr } from './recording'

//  Binary paths 
// Inside a packaged app these live in app.asar.unpacked (see electron-builder.yml).
function unpacked(p: string): string {
  return p.replace('app.asar', 'app.asar.unpacked')
}

function ffmpegPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const p = require('ffmpeg-static') as string | null
  if (!p) throw new Error('ffmpeg binary not found - run: npm install ffmpeg-static --legacy-peer-deps')
  return unpacked(p)
}

function ffprobePath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('ffprobe-static') as { path: string }
  if (!mod?.path) throw new Error('ffprobe binary not found - run: npm install ffprobe-static --legacy-peer-deps')
  return unpacked(mod.path)
}

//  Types shared with the renderer (mirrored in src/renderer/src/types/convert.ts)
export interface ProbeResult {
  width: number          // display width (after rotation)
  height: number         // display height (after rotation)
  fps: number
  duration: number       // seconds
  codec: string
  sizeBytes: number
  rotation: number
}

export type ResolutionOption = '720' | '1080' | 'original'
export type QualityOption = 'fast' | 'balanced' | 'best'

export interface ConvertRequest {
  srcPath: string
  startSec: number
  endSec: number
  resolution: ResolutionOption
  quality: QualityOption
  cameraAngle: string     // FO | DL | Other
  club: string
}

export interface ConvertProgress {
  jobId: string
  pct: number             // 0..1
  fps?: number            // encode speed
}

//  Probe 
function parseFrac(s: string | undefined): number {
  if (!s) return 0
  const [n, d] = s.split('/').map(Number)
  if (!d) return n || 0
  return d === 0 ? 0 : n / d
}

async function probe(filePath: string): Promise<ProbeResult> {
  const args = [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    '-select_streams', 'v:0',
    filePath
  ]
  const json = await new Promise<string>((resolve, reject) => {
    execFile(ffprobePath(), args, { maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`ffprobe failed: ${stderr || err.message}`))
      else resolve(stdout)
    })
  })
  const info = JSON.parse(json)
  const v = info.streams?.[0]
  if (!v) throw new Error('No video stream found')

  // Rotation can live in stream tags (older) or side_data displaymatrix (newer)
  let rotation = 0
  const tagRot = parseInt(v.tags?.rotate ?? '0', 10)
  if (!Number.isNaN(tagRot)) rotation = tagRot
  const sd = (v.side_data_list ?? []).find((d: any) => typeof d.rotation === 'number')
  if (sd) rotation = sd.rotation
  rotation = ((Math.round(rotation) % 360) + 360) % 360

  const rotated = rotation === 90 || rotation === 270
  const w = Number(v.width) || 0
  const h = Number(v.height) || 0

  // Prefer avg_frame_rate (true average for VFR); fall back to r_frame_rate
  const fps = parseFrac(v.avg_frame_rate) || parseFrac(v.r_frame_rate) || 30
  const duration = Number(v.duration) || Number(info.format?.duration) || 0

  return {
    width: rotated ? h : w,
    height: rotated ? w : h,
    fps: Math.round(fps * 1000) / 1000,
    duration,
    codec: String(v.codec_name ?? ''),
    sizeBytes: Number(info.format?.size) || 0,
    rotation
  }
}

//  Convert 
const jobs = new Map<string, ChildProcess>()

const QUALITY: Record<QualityOption, { preset: string; crf: string }> = {
  fast:     { preset: 'veryfast', crf: '20' },
  balanced: { preset: 'medium',   crf: '18' },
  best:     { preset: 'slow',     crf: '16' }
}

function scaleFilter(src: ProbeResult, resolution: ResolutionOption): string {
  // Even dimensions are required by yuv420p; -2 rounds the free axis to even.
  if (resolution === 'original') return 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
  const cap = resolution === '720' ? 720 : 1080
  const landscape = src.width >= src.height
  // Cap the SHORT side: 1080p landscape stays 1920x1080; portrait phone video
  // becomes 1080 wide rather than being squashed to 608x1080.
  return landscape
    ? `scale=-2:'min(ih,${cap})'`
    : `scale='min(iw,${cap})':-2`
}

function outputPath(cameraAngle: string): string {
  const dir = getRecordingsDir()
  mkdirSync(dir, { recursive: true })
  const angle = (cameraAngle || 'Other').replace(/[^A-Za-z0-9]/g, '') || 'Other'
  let n = nextSwingNumber()
  let p = join(dir, `${todayDateStr()}.${angle}.${n}.mp4`)
  while (existsSync(p)) {
    n++
    p = join(dir, `${todayDateStr()}.${angle}.${n}.mp4`)
  }
  return p
}

export function registerConvertHandlers(win: BrowserWindow): void {
  ipcMain.handle('convert:probe', async (_e, filePath: string) => probe(filePath))

  ipcMain.handle('convert:start', async (_e, req: ConvertRequest) => {
    const src = await probe(req.srcPath)
    const start = Math.max(0, Math.min(req.startSec, src.duration))
    const end = Math.max(start + 0.05, Math.min(req.endSec, src.duration || req.endSec))
    const clipDuration = end - start
    const q = QUALITY[req.quality] ?? QUALITY.balanced
    const outPath = outputPath(req.cameraAngle)
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const args = [
      '-hide_banner', '-nostats', '-y',
      // Fast input seek to the in-point, then re-encode exactly clipDuration
      '-ss', start.toFixed(3),
      '-i', req.srcPath,
      '-t', clipDuration.toFixed(3),
      '-an',
      '-vf', scaleFilter(src, req.resolution),
      '-fps_mode', 'cfr',
      '-r', String(src.fps),
      '-c:v', 'libx264',
      '-preset', q.preset,
      '-crf', q.crf,
      // All-intra: every frame is a keyframe -> instant seeking anywhere
      '-g', '1', '-keyint_min', '1',
      '-x264-params', 'keyint=1:min-keyint=1:scenecut=0',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-progress', 'pipe:1',
      outPath
    ]

    const child = spawn(ffmpegPath(), args, { windowsHide: true })
    jobs.set(jobId, child)

    let stderrTail = ''
    child.stderr?.on('data', (d) => {
      stderrTail = (stderrTail + d.toString()).slice(-4000)
    })

    // -progress writes key=value blocks; out_time_us tracks encoded position
    let buf = ''
    child.stdout?.on('data', (d) => {
      buf += d.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      let outUs = -1
      let encFps: number | undefined
      for (const line of lines) {
        const [k, v] = line.trim().split('=')
        if (k === 'out_time_us' || k === 'out_time_ms') outUs = Number(v)
        else if (k === 'fps') encFps = Number(v)
      }
      if (outUs >= 0 && !win.isDestroyed()) {
        const pct = Math.max(0, Math.min(1, outUs / 1_000_000 / clipDuration))
        const msg: ConvertProgress = { jobId, pct, fps: encFps }
        win.webContents.send('convert:progress', msg)
      }
    })

    const result = await new Promise<{ ok: true; outPath: string } | { ok: false; error: string }>((resolve) => {
      child.on('error', (err) => resolve({ ok: false, error: `ffmpeg could not start: ${err.message}` }))
      child.on('close', (code, signal) => {
        if (signal === 'SIGTERM' || signal === 'SIGKILL') resolve({ ok: false, error: 'cancelled' })
        else if (code === 0) resolve({ ok: true, outPath })
        else resolve({ ok: false, error: `ffmpeg exited with code ${code}\n${stderrTail.split('\n').slice(-6).join('\n')}` })
      })
    })
    jobs.delete(jobId)

    if (!result.ok) {
      // Don't leave a half-written file in the recordings folder
      try { if (existsSync(outPath)) unlinkSync(outPath) } catch { /* ignore */ }
      return { jobId, ok: false, error: result.error }
    }

    const out = await probe(outPath).catch(() => null)
    const fps = out?.fps ?? src.fps
    const duration = out?.duration ?? clipDuration
    return {
      jobId,
      ok: true,
      clip: {
        id: `import-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: outPath.split(/[\\/]/).pop()!,
        filePath: outPath,
        duration,
        fps,
        frameCount: Math.round(duration * fps),
        thumbnailPath: null,
        recordedAt: new Date().toISOString(),
        cameraLabel: 'Imported',
        cameraAngle: req.cameraAngle,
        club: req.club,
        tags: [],
        annotations: []
      }
    }
  })

  // Note: the jobId is only known to the renderer once convert:start resolves,
  // so cancel targets "the newest running job" when no id matches.
  ipcMain.handle('convert:cancel', (_e, jobId?: string) => {
    const child = (jobId && jobs.get(jobId)) || Array.from(jobs.values()).pop()
    if (!child) return false
    child.kill('SIGTERM')
    return true
  })
}
