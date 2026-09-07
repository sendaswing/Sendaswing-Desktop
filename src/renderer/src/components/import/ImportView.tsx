import React, { useCallback, useEffect, useRef, useState } from 'react'
import { FileVideo, Play, Pause, SkipBack, SkipForward, Scissors, Loader2, X, Check, FolderOpen } from 'lucide-react'
import { TrimBar } from './TrimBar'
import { useClipStore } from '../../store/clipStore'
import { useAnalysisStore } from '../../store/analysisStore'
import { cn } from '../../lib/utils/cn'
import type { Clip, CameraAngle, ClubType } from '../../types/clip'
import type { ProbeResult, ResolutionOption, QualityOption } from '../../types/convert'

interface ImportViewProps {
  /** File to load immediately (from Open / drag-drop in Analyze). */
  initialPath?: string | null
  /** Called when the user backs out or finishes; Analyze takes over again. */
  onClose: () => void
}

const ANGLES: CameraAngle[] = ['FO', 'DL', 'Other']
const CLUBS: ClubType[] = ['Driver', 'Iron', 'Wedge', 'FW', 'Hybrid', 'Putt']

const RESOLUTIONS: Array<{ value: ResolutionOption; label: string; hint: string }> = [
  { value: '720', label: '720p', hint: 'Smallest files, fastest' },
  { value: '1080', label: '1080p', hint: 'Recommended' },
  { value: 'original', label: 'Original', hint: 'Keep source size (4K stays 4K)' }
]

const QUALITIES: Array<{ value: QualityOption; label: string; hint: string }> = [
  { value: 'fast', label: 'Fast', hint: 'Quick convert, slightly larger file' },
  { value: 'balanced', label: 'Balanced', hint: 'Recommended' },
  { value: 'best', label: 'Best', hint: 'Slowest convert, highest quality' }
]

type Phase = 'empty' | 'probing' | 'ready' | 'converting' | 'done' | 'error'

function fmtTime(t: number, fps: number): string {
  if (!isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const f = Math.floor((t - Math.floor(t)) * fps)
  return `${m}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`
}

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`
}

const api = () => (window as any).electronAPI

export function ImportView({ initialPath, onClose }: ImportViewProps) {
  const [phase, setPhase] = useState<Phase>('empty')
  const [srcPath, setSrcPath] = useState<string | null>(null)
  const [srcName, setSrcName] = useState('')
  const [info, setInfo] = useState<ProbeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Trim state (seconds)
  const [inPoint, setInPoint] = useState(0)
  const [outPoint, setOutPoint] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  // Options
  const [resolution, setResolution] = useState<ResolutionOption>('1080')
  const [quality, setQuality] = useState<QualityOption>('balanced')
  const [angle, setAngle] = useState<CameraAngle>('FO')
  const [club, setClub] = useState<ClubType>('Driver')

  // Conversion
  const [progress, setProgress] = useState(0)
  const [encodeFps, setEncodeFps] = useState<number | undefined>(undefined)
  const [resultClip, setResultClip] = useState<Clip | null>(null)

  const [isDragOver, setIsDragOver] = useState(false)
  // Preview source: streamed via sas-media:// first; falls back to a blob copy
  // (readFileAsBuffer) if the stream route can't load the file.
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<'stream' | 'blob'>('stream')
  const blobUrlRef = useRef<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const inRef = useRef(0)
  const outRef = useRef(0)
  inRef.current = inPoint
  outRef.current = outPoint

  const addClip = useClipStore((s) => s.addClip)
  const setActiveClip = useAnalysisStore((s) => s.setActiveClip)

  const fps = info?.fps ?? 30

  //  Loading a source file 
  const loadSource = useCallback(async (filePath: string) => {
    setPhase('probing')
    setError(null)
    setResultClip(null)
    setProgress(0)
    setSrcPath(filePath)
    setSrcName(filePath.split(/[\\/]/).pop() ?? filePath)
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }
    setPreviewMode('stream')
    setPreviewSrc(api().fs.mediaUrl(filePath))
    try {
      const p: ProbeResult = await api().convert.probe(filePath)
      setInfo(p)
      setInPoint(0)
      setOutPoint(p.duration)
      setCurrentTime(0)
      setPhase('ready')
    } catch (e) {
      setError(`Couldn't read that video. ${String((e as Error)?.message ?? e)}`)
      setPhase('error')
    }
  }, [])

  // Load the file handed to us by Analyze
  useEffect(() => {
    if (initialPath) loadSource(initialPath)
  }, [initialPath, loadSource])

  // If the streamed source fails, load the file into memory instead
  const onPreviewError = useCallback(async () => {
    if (!srcPath || previewMode === 'blob') {
      if (previewMode === 'blob') setError('The preview could not play this file. Conversion may still work.')
      return
    }
    console.warn('[Import] sas-media stream failed for preview, falling back to blob copy')
    try {
      const buffer: ArrayBuffer = await api().fs.readFileAsBuffer(srcPath)
      const url = URL.createObjectURL(new Blob([buffer]))
      blobUrlRef.current = url
      setPreviewMode('blob')
      setPreviewSrc(url)
    } catch (e) {
      setError(`Preview unavailable: ${String((e as Error)?.message ?? e)}`)
    }
  }, [srcPath, previewMode])

  useEffect(() => () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current) }, [])

  const chooseFile = useCallback(async () => {
    const paths: string[] = await api().fs.openVideo()
    if (paths?.[0]) loadSource(paths[0])
  }, [loadSource])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    const p = file && api().fs.getPathForFile(file)
    if (p) loadSource(p)
  }, [loadSource])

  //  Preview playback 
  const seekTo = useCallback((t: number) => {
    const v = videoRef.current
    if (!v) return
    v.currentTime = Math.max(0, Math.min(t, v.duration || t))
    setCurrentTime(v.currentTime)
  }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      // Play from the in-point if we're outside the kept region
      if (v.currentTime < inRef.current || v.currentTime >= outRef.current - 0.02) v.currentTime = inRef.current
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [])

  const step = useCallback((frames: number) => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    seekTo(v.currentTime + frames / fps)
  }, [fps, seekTo])

  // Loop playback inside the trimmed region
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => {
      setCurrentTime(v.currentTime)
      if (!v.paused && v.currentTime >= outRef.current) {
        v.pause()
        v.currentTime = inRef.current
      }
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('ended', onPause)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('ended', onPause)
    }
  }, [srcPath, phase, previewSrc])

  // Keyboard: Space play/pause, Left/Right step, I/O set in/out
  useEffect(() => {
    if (phase !== 'ready') return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlay(); break
        case 'ArrowRight': e.preventDefault(); step(e.shiftKey ? 10 : 1); break
        case 'ArrowLeft': e.preventDefault(); step(e.shiftKey ? -10 : -1); break
        case 'i': case 'I': setInPoint(Math.min(videoRef.current?.currentTime ?? 0, outRef.current - 0.1)); break
        case 'o': case 'O': setOutPoint(Math.max(videoRef.current?.currentTime ?? 0, inRef.current + 0.1)); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, togglePlay, step])

  //  Conversion 
  useEffect(() => {
    if (phase !== 'converting') return
    const off = api().convert.onProgress((p: { pct: number; fps?: number }) => {
      setProgress(p.pct)
      setEncodeFps(p.fps)
    })
    return off
  }, [phase])

  const convert = useCallback(async () => {
    if (!srcPath || !info) return
    videoRef.current?.pause()
    setPhase('converting')
    setProgress(0)
    setError(null)
    const res = await api().convert.start({
      srcPath,
      startSec: inPoint,
      endSec: outPoint,
      resolution,
      quality,
      cameraAngle: angle,
      club
    })
    if (res.ok) {
      const clip: Clip = res.clip
      addClip(clip)
      setResultClip(clip)
      setProgress(1)
      setPhase('done')
    } else {
      setError(res.error === 'cancelled' ? null : res.error)
      setPhase(res.error === 'cancelled' ? 'ready' : 'error')
    }
  }, [srcPath, info, inPoint, outPoint, resolution, quality, angle, club, addClip])

  const cancel = useCallback(() => { api().convert.cancel() }, [])

  const openInAnalyze = useCallback(() => {
    if (resultClip) setActiveClip(resultClip)
    onClose()
  }, [resultClip, setActiveClip, onClose])

  const reset = useCallback(() => {
    setPhase('empty')
    setSrcPath(null)
    setInfo(null)
    setResultClip(null)
    setError(null)
  }, [])

  //  Derived 
  const clipSecs = Math.max(0, outPoint - inPoint)
  const outSize = (() => {
    if (!info) return null
    if (resolution === 'original') return { w: info.width, h: info.height }
    const cap = resolution === '720' ? 720 : 1080
    const landscape = info.width >= info.height
    const short = landscape ? info.height : info.width
    if (short <= cap) return { w: info.width, h: info.height }
    const scale = cap / short
    return { w: Math.round(info.width * scale / 2) * 2, h: Math.round(info.height * scale / 2) * 2 }
  })()

  //  Render 
  if (phase === 'empty' || (phase === 'error' && !srcPath)) {
    return (
      <div
        className={cn(
          'h-full flex flex-col items-center justify-center gap-4 m-6 rounded-xl border-2 border-dashed transition-colors',
          isDragOver ? 'border-accent-400 bg-accent-500/10' : 'border-white/10'
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <FileVideo size={40} className="text-white/20" />
        <div className="text-center">
          <div className="text-white/80 text-sm font-medium">Drop a video here to import</div>
          <div className="text-white/40 text-xs mt-1">
            Any phone or camera video. It will be trimmed and converted to the studio format for instant scrubbing.
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={chooseFile} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors">
            <FolderOpen size={14} /> Choose video…
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-white/50 hover:text-white/80 text-sm transition-colors">
            Back to Analyze
          </button>
        </div>
        {error && <div className="text-red-400 text-xs max-w-md text-center">{error}</div>}
      </div>
    )
  }

  return (
    <div className="h-full flex min-w-0">
      {/*  Preview + trim  */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-800 border-b border-white/5 shrink-0">
          <Scissors size={13} className="text-white/40" />
          <span className="text-xs text-white/70 truncate">{srcName}</span>
          <div className="flex-1" />
          <button onClick={onClose} title="Cancel import and return to Analyze" className="icon-btn"><X size={14} /></button>
        </div>

        <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center">
          {phase === 'probing' && (
            <div className="flex items-center gap-2 text-white/60 text-sm"><Loader2 size={16} className="animate-spin" /> Reading video…</div>
          )}
          {srcPath && previewSrc && phase !== 'probing' && (
            <video
              key={previewSrc}
              ref={videoRef}
              src={previewSrc}
              className="w-full h-full object-contain"
              muted
              playsInline
              preload="auto"
              onClick={togglePlay}
              onError={onPreviewError}
              onLoadedMetadata={() => console.info(`[Import] preview loaded via ${previewMode}`)}
            />
          )}

          {phase === 'converting' && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
              <Loader2 size={22} className="animate-spin text-accent-400" />
              <div className="text-white/80 text-sm">Converting… {Math.round(progress * 100)}%</div>
              <div className="w-64 h-1.5 rounded bg-white/10 overflow-hidden">
                <div className="h-full bg-accent-500 transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
              </div>
              {encodeFps ? <div className="text-white/30 text-xs">{Math.round(encodeFps)} fps</div> : null}
              <button onClick={cancel} className="mt-2 px-3 py-1 rounded bg-white/10 hover:bg-white/15 text-white/70 text-xs">Cancel</button>
            </div>
          )}

          {phase === 'done' && resultClip && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent-500/20 flex items-center justify-center"><Check size={20} className="text-accent-400" /></div>
              <div className="text-white/90 text-sm font-medium">Saved as {resultClip.name}</div>
              <div className="text-white/40 text-xs">{resultClip.frameCount} frames · {resultClip.fps} fps · added to your Clips</div>
              <div className="flex gap-2 mt-2">
                <button onClick={openInAnalyze} className="px-4 py-2 rounded-lg bg-accent-500 hover:bg-accent-600 text-black text-sm font-medium">Open in Analyze</button>
                <button onClick={reset} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm">Import another</button>
              </div>
            </div>
          )}
        </div>

        {/* Transport + trim bar */}
        <div className="shrink-0 px-4 pt-2 pb-3 bg-surface-800 border-t border-white/5">
          <TrimBar
            duration={info?.duration ?? 0}
            inPoint={inPoint}
            outPoint={outPoint}
            currentTime={currentTime}
            onSeek={seekTo}
            onChangeIn={setInPoint}
            onChangeOut={setOutPoint}
          />
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => step(-1)} title="Previous frame (Left)" className="icon-btn"><SkipBack size={14} /></button>
            <button onClick={togglePlay} title="Play / Pause (Space)" className="icon-btn-lg">
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button onClick={() => step(1)} title="Next frame (Right)" className="icon-btn"><SkipForward size={14} /></button>

            <div className="w-px h-5 bg-white/10 mx-1" />

            <button
              onClick={() => setInPoint(Math.min(currentTime, outPoint - 0.1))}
              title="Set In point at playhead (I)"
              className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 text-white/70"
            >
              Set In
            </button>
            <button
              onClick={() => setOutPoint(Math.max(currentTime, inPoint + 0.1))}
              title="Set Out point at playhead (O)"
              className="px-2 py-1 rounded text-xs bg-white/5 hover:bg-white/10 text-white/70"
            >
              Set Out
            </button>
            <button
              onClick={() => { setInPoint(0); setOutPoint(info?.duration ?? 0) }}
              title="Reset trim"
              className="px-2 py-1 rounded text-xs text-white/40 hover:text-white/70"
            >
              Reset
            </button>

            <div className="flex-1" />
            <div className="font-mono text-[11px] text-white/50 tabular-nums">
              <span className="text-accent-400">{fmtTime(inPoint, fps)}</span>
              <span className="mx-1 text-white/25">→</span>
              <span className="text-accent-400">{fmtTime(outPoint, fps)}</span>
              <span className="mx-2 text-white/25">|</span>
              {fmtTime(currentTime, fps)} / {fmtTime(info?.duration ?? 0, fps)}
            </div>
          </div>
        </div>
      </div>

      {/*  Options  */}
      <div className="w-72 shrink-0 border-l border-white/5 bg-surface-800 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Source</div>
          {info ? (
            <div className="text-xs text-white/60 space-y-0.5">
              <div>{info.width} × {info.height} · {info.fps} fps</div>
              <div>{fmtTime(info.duration, fps)} · {fmtMB(info.sizeBytes)} · {info.codec.toUpperCase()}</div>
            </div>
          ) : <div className="text-xs text-white/30">-</div>}
        </div>

        <OptionGroup title="Resolution">
          {RESOLUTIONS.map((r) => (
            <OptionButton key={r.value} active={resolution === r.value} onClick={() => setResolution(r.value)} label={r.label} hint={r.hint} />
          ))}
        </OptionGroup>

        <OptionGroup title="Quality">
          {QUALITIES.map((q) => (
            <OptionButton key={q.value} active={quality === q.value} onClick={() => setQuality(q.value)} label={q.label} hint={q.hint} />
          ))}
        </OptionGroup>

        <div className="p-4 border-b border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Angle</div>
          <div className="flex gap-1">
            {ANGLES.map((a) => (
              <button
                key={a}
                onClick={() => setAngle(a)}
                className={cn('px-2.5 py-1 rounded text-xs transition-colors',
                  angle === a ? 'bg-white/20 text-white font-semibold' : 'bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/10')}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2 mt-4">Club</div>
          <div className="flex flex-wrap gap-1">
            {CLUBS.map((c) => (
              <button
                key={c}
                onClick={() => setClub(c)}
                className={cn('px-2 py-0.5 rounded text-xs transition-colors',
                  club === c ? 'bg-white/20 text-white font-semibold' : 'bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/10')}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 mt-auto">
          <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Output</div>
          <div className="text-xs text-white/60 space-y-0.5 mb-3">
            <div>{clipSecs.toFixed(2)} s · {Math.round(clipSecs * fps)} frames</div>
            {outSize && <div>{outSize.w} × {outSize.h} · {fps} fps · every frame a keyframe</div>}
            <div className="text-white/30">Saved to your recordings folder</div>
          </div>
          {error && <div className="text-red-400 text-xs mb-3 whitespace-pre-wrap break-words">{error}</div>}
          <button
            onClick={convert}
            disabled={phase !== 'ready' || !info || clipSecs < 0.1}
            className={cn('w-full py-2.5 rounded-lg text-sm font-medium transition-colors',
              phase === 'ready' && info
                ? 'bg-accent-500 hover:bg-accent-600 text-black'
                : 'bg-white/5 text-white/30 cursor-not-allowed')}
          >
            {phase === 'converting' ? 'Converting…' : 'Convert & Import'}
          </button>
        </div>
      </div>
    </div>
  )
}

function OptionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 border-b border-white/5">
      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2">{title}</div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

function OptionButton({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors',
        active ? 'bg-white/15 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80')}
    >
      <span className="text-xs font-medium">{label}</span>
      <span className="text-[10px] text-white/30">{hint}</span>
    </button>
  )
}
