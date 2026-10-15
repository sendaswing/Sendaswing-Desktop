/**
 * StreamView — what the OBS stream window shows. Rendered into the separate
 * "SaS Stream" window by streamWindow.tsx; it shares all the app's stores, so
 * it simply follows what the main window is doing:
 *
 *   Capture screen → the live cameras, laid out like the Capture grid
 *                    (1 camera = full frame, 2 = side by side, 3–4 = 2×2)
 *   Analyze screen → the swing on replay: every angle of the latest swing (or
 *                    the clip(s) open in Analyze), all starting together at
 *                    the replay speed and looping, kept in sync
 *
 * While a swing is being saved it stays on the live view so the old swing
 * never flashes up. Nothing here is clickable except double-click = fullscreen.
 *
 * Styles are inline on purpose: this window is a separate document and does
 * not get the app's Tailwind stylesheet.
 */
import React, { useEffect, useMemo, useRef } from 'react'
import { useUiStore } from '../../store/uiStore'
import { useCameraStore } from '../../store/cameraStore'
import { useRecordingStore } from '../../store/recordingStore'
import { useAnalysisStore } from '../../store/analysisStore'
import { useComparisonStore } from '../../store/comparisonStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { Clip } from '../../types/clip'

/** Pause on the last frame before the replay loops. */
const LOOP_HOLD_MS = 1000
/** How often followers are nudged back in line with the first video. */
const SYNC_INTERVAL_MS = 150

export function StreamView() {
  const route = useUiStore((s) => s.route)
  const bufferStatus = useRecordingStore((s) => s.bufferStatus)
  const lastSwingClips = useRecordingStore((s) => s.lastSwingClips)
  const activeClip = useAnalysisStore((s) => s.activeClip)
  const pendingImportPath = useAnalysisStore((s) => s.pendingImportPath)
  const rightClip = useComparisonStore((s) => s.rightClip)
  const dualMode = useComparisonStore((s) => s.dualMode)
  const replaySpeed = useSettingsStore((s) => s.replaySpeed) || 0.25
  const overlays = useSettingsStore((s) => s.streamOverlays)

  const savingSwing = bufferStatus === 'capturing' || bufferStatus === 'processing'

  const replayClips: Clip[] = useMemo(() => {
    if (!activeClip) return []
    // The latest swing: show every angle it was recorded from
    if (lastSwingClips.some((c) => c.id === activeClip.id)) return lastSwingClips.slice(0, 4)
    // Anything else: mirror Analyze's panels
    return dualMode && rightClip ? [activeClip, rightClip] : [activeClip]
  }, [activeClip, lastSwingClips, dualMode, rightClip])

  const showReplay = route === 'analyze' && !pendingImportPath && !savingSwing && replayClips.length > 0
  const replayKey = replayClips.map((c) => c.id).join('|')

  const toggleFullscreen = (e: React.MouseEvent) => {
    const doc = e.currentTarget.ownerDocument
    if (doc.fullscreenElement) void doc.exitFullscreen()
    else void doc.documentElement.requestFullscreen()
  }

  return (
    <div style={styles.root} onDoubleClick={toggleFullscreen}>
      {showReplay ? (
        <SyncedReplay key={`${replayKey}@${replaySpeed}`} clips={replayClips} speed={replaySpeed} overlays={overlays} />
      ) : (
        <LiveCameras overlays={overlays} saving={savingSwing} />
      )}
    </div>
  )
}

// ─── Live ────────────────────────────────────────────────────────────────────

function LiveCameras({ overlays, saving }: { overlays: boolean; saving: boolean }) {
  const slots = useCameraStore((s) => s.slots)
  const gridLayout = useCameraStore((s) => s.gridLayout)
  const visibleCount = gridLayout === '1x1' ? 1 : gridLayout === '2x1' ? 2 : 4
  const live = slots.slice(0, visibleCount).filter((s) => s.stream && s.status === 'streaming')

  if (!live.length) {
    return <div style={styles.idle}>SEND A SWING</div>
  }

  return (
    <>
      <Tiles count={live.length}>
        {live.map((slot) => (
          <div key={slot.index} style={styles.tile}>
            <LiveVideo stream={slot.stream!} flipH={slot.flipH} flipV={slot.flipV} />
            {overlays && slot.cameraAngle && <span style={styles.angle}>{slot.cameraAngle}</span>}
          </div>
        ))}
      </Tiles>
      {overlays && (
        <span style={styles.badge}>
          <span style={{ ...styles.dot, background: saving ? '#f59e0b' : '#ef4444' }} />
          {saving ? 'SAVING SWING' : 'LIVE'}
        </span>
      )}
    </>
  )
}

function LiveVideo({ stream, flipH, flipV }: { stream: MediaStream; flipH: boolean; flipV: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.srcObject = stream
    void v.play().catch(() => { /* autoplay retries when frames arrive */ })
    return () => { v.srcObject = null }
  }, [stream])

  const transform = [flipH && 'scaleX(-1)', flipV && 'scaleY(-1)'].filter(Boolean).join(' ') || undefined
  return <video ref={ref} autoPlay muted playsInline style={{ ...styles.video, transform }} />
}

// ─── Replay ──────────────────────────────────────────────────────────────────

/**
 * Plays 1–4 clips from time 0 together at `speed`, looping. Buffered clips are
 * all cut around the same strike, so equal times = the same moment in the
 * swing. The first video is the clock; the others are nudged slightly faster
 * or slower to stay within ~10 ms (media time) of it, and jumped if they fall
 * far behind.
 */
function SyncedReplay({ clips, speed, overlays }: { clips: Clip[]; speed: number; overlays: boolean }) {
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([])
  const api = (window as any).electronAPI

  useEffect(() => {
    const vids = clips
      .map((_, i) => videoRefs.current[i])
      .filter((v): v is HTMLVideoElement => !!v)
    if (!vids.length) return

    let disposed = false
    let restarting = false
    let loopPending = false
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => { timers.delete(t); fn() }, ms)
      timers.add(t)
    }

    const allReady = () => vids.every((v) => v.readyState >= 3 && !v.seeking)

    // Rewind everything to 0, wait until every video can play, start them all at once
    const startTogether = () => {
      restarting = true
      for (const v of vids) {
        v.pause()
        v.defaultPlaybackRate = speed
        v.playbackRate = speed
        if (v.currentTime !== 0) v.currentTime = 0
      }
      const began = performance.now()
      const waitThenPlay = () => {
        if (disposed) return
        if (allReady() || performance.now() - began > 5000) {
          restarting = false
          for (const v of vids) void v.play().catch(() => {})
        } else {
          later(waitThenPlay, 20)
        }
      }
      waitThenPlay()
    }

    // First clip to finish holds the last frame briefly, then all loop together
    const onEnded = () => {
      if (restarting || loopPending || disposed) return
      loopPending = true
      later(() => {
        loopPending = false
        startTogether()
      }, LOOP_HOLD_MS)
    }

    const sync = setInterval(() => {
      if (restarting || loopPending) return
      const lead = vids[0]
      if (lead.paused || lead.ended || lead.seeking) return
      for (const f of vids.slice(1)) {
        if (f.paused || f.ended || f.seeking) continue
        const drift = lead.currentTime - f.currentTime
        if (Math.abs(drift) > 0.25) f.currentTime = lead.currentTime
        else if (Math.abs(drift) > 0.01) f.playbackRate = speed * (drift > 0 ? 1.1 : 0.9)
        else if (f.playbackRate !== speed) f.playbackRate = speed
      }
    }, SYNC_INTERVAL_MS)

    for (const v of vids) v.addEventListener('ended', onEnded)
    startTogether()

    return () => {
      disposed = true
      clearInterval(sync)
      for (const t of timers) clearTimeout(t)
      for (const v of vids) {
        v.removeEventListener('ended', onEnded)
        v.pause()
      }
    }
    // The parent remounts this component whenever the clips or speed change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const speedLabel = `${Number(speed.toFixed(2))}×`
  const club = clips[0]?.club

  return (
    <>
      <Tiles count={clips.length}>
        {clips.map((clip, i) => (
          <div key={clip.id} style={styles.tile}>
            <video
              ref={(el) => { videoRefs.current[i] = el }}
              src={api.fs.mediaUrl(clip.filePath)}
              muted
              playsInline
              preload="auto"
              style={styles.video}
            />
            {overlays && clip.cameraAngle && <span style={styles.angle}>{clip.cameraAngle}</span>}
          </div>
        ))}
      </Tiles>
      {overlays && (
        <span style={styles.badge}>
          REPLAY {speedLabel}{club ? ` · ${club.toUpperCase()}` : ''}
        </span>
      )}
    </>
  )
}

// ─── Layout ──────────────────────────────────────────────────────────────────

/** 1 = full frame, 2 = side by side, 3–4 = 2×2 — same as the Capture grid. */
function Tiles({ count, children }: { count: number; children: React.ReactNode }) {
  const cols = count <= 1 ? 1 : 2
  const rows = count <= 2 ? 1 : 2
  return (
    <div
      style={{
        ...styles.grid,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`
      }}
    >
      {children}
    </div>
  )
}

const chip: React.CSSProperties = {
  position: 'absolute',
  padding: '0.4vh 1vh',
  borderRadius: '0.6vh',
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  fontSize: '2.2vh',
  fontWeight: 700,
  letterSpacing: '0.12em',
  lineHeight: 1.2,
  pointerEvents: 'none',
  userSelect: 'none'
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    background: '#000',
    overflow: 'hidden',
    cursor: 'none',
    fontFamily: "'Segoe UI', -apple-system, Roboto, sans-serif"
  },
  grid: {
    display: 'grid',
    width: '100%',
    height: '100%',
    gap: 2,
    background: '#000'
  },
  tile: {
    position: 'relative',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    background: '#000'
  },
  video: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    background: '#000'
  },
  angle: { ...chip, left: '1.5vh', bottom: '1.5vh' },
  badge: { ...chip, top: '1.5vh', right: '1.5vh', display: 'flex', alignItems: 'center', gap: '0.8vh' },
  dot: { width: '1.3vh', height: '1.3vh', borderRadius: '50%', display: 'inline-block' },
  idle: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255,255,255,0.15)',
    fontSize: '4vh',
    fontWeight: 700,
    letterSpacing: '0.3em',
    userSelect: 'none'
  }
}
