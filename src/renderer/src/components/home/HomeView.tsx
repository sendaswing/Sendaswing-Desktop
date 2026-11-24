import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Video, BarChart2, Columns, BookOpen, MonitorPlay, Settings, Globe,
  Download, Folder, FolderOpen, ChevronRight, ChevronDown, RefreshCw, Film
} from 'lucide-react'
import { useUiStore } from '../../store/uiStore'
import { useAnalysisStore } from '../../store/analysisStore'
import { useComparisonStore } from '../../store/comparisonStore'
import { useClipStore } from '../../store/clipStore'
import { pairedStart } from '../../lib/replay/pairedStart'
import { toggleStreamWindow } from '../stream/streamWindow'
import { makeSemaphore } from '../../lib/utils/semaphore'
import { cn } from '../../lib/utils/cn'
import { groupDays, groupByPlayer, dayKeyOf, type Day, type Swing, type RecordingFile } from '../../lib/home/swings'
import type { Clip } from '../../types/clip'

const api = () => (window as any).electronAPI
const SENDASWING_URL = 'https://sendaswing.com'
/** Days listed under "Earlier"; anything older is still in Library / the recordings folder. */
const MAX_EARLIER_DAYS = 30
const ALL = '__all'
const NO_PLAYER = '__none'

const thumbSemaphore = makeSemaphore(3)

function dayLabel(d: Date): string {
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (dayKeyOf(d) === dayKeyOf(yesterday)) return 'Yesterday'
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }
  if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString(undefined, opts)
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// ---------------------------------------------------------------------------
// Thumbnail: OS thumbnail cache first, then a decoded frame (same approach as
// Library / ClipBrowser). Only loads once the card scrolls into view.
// ---------------------------------------------------------------------------
function Thumb({ filePath, angle }: { filePath: string; angle: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false

    const load = async () => {
      const dataUrl: string | null = await api()?.fs.getThumbnail(filePath)
      if (cancelled) return
      if (dataUrl) { setSrc(dataUrl); return }

      await thumbSemaphore.acquire()
      if (cancelled) { thumbSemaphore.release(); return }
      let objectUrl = ''
      try {
        const buffer: ArrayBuffer = await api().fs.readFileAsBuffer(filePath)
        if (cancelled) return
        objectUrl = URL.createObjectURL(new Blob([buffer]))
        const video = document.createElement('video')
        video.src = objectUrl
        video.muted = true
        video.preload = 'metadata'
        video.load()
        await new Promise<void>((res) => {
          video.onloadedmetadata = () => {
            video.currentTime = isFinite(video.duration) && video.duration > 0
              ? Math.min(1, video.duration * 0.1)
              : 0.5
          }
          video.onseeked = () => res()
          video.onerror = () => res()
        })
        if (cancelled) return
        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = 180
        canvas.getContext('2d')!.drawImage(video, 0, 0, 320, 180)
        if (!cancelled) setSrc(canvas.toDataURL('image/jpeg', 0.7))
      } catch {
        // leave the placeholder
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        thumbSemaphore.release()
      }
    }

    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { obs.disconnect(); load() } },
      { rootMargin: '200px' }
    )
    obs.observe(el)
    return () => { cancelled = true; obs.disconnect() }
  }, [filePath])

  return (
    <div ref={ref} className="relative h-36 rounded-lg overflow-hidden bg-black/60">
      {src
        ? <img src={src} className="w-full h-full object-cover" alt="" />
        : <div className="absolute inset-0 flex items-center justify-center"><Film size={20} className="text-white/15" /></div>}
      {angle && (
        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[11px] font-semibold font-mono text-white/90 leading-none">
          {angle}
        </span>
      )}
    </div>
  )
}

function SwingCard({ swing, onOpen }: { swing: Swing; onOpen: (s: Swing) => void }) {
  const shown = swing.clips.slice(0, 2)
  const extra = swing.clips.length - shown.length
  const title = swing.clips.map((c) => c.name).join(' + ')
  return (
    <button
      onClick={() => onOpen(swing)}
      title={`Open in Analyze: ${title}`}
      className="group flex flex-col gap-2 p-2 rounded-xl bg-surface-800 border border-white/5 hover:border-accent-500/50 transition-colors text-left"
    >
      <div className={cn('grid gap-1.5', shown.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {shown.map((c) => <Thumb key={c.filePath} filePath={c.filePath} angle={c.cameraAngle} />)}
      </div>
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <span className="text-sm font-semibold text-white/85 group-hover:text-white truncate">
          {swing.label}{extra > 0 && <span className="ml-1.5 text-xs font-normal text-white/40">+{extra} more</span>}
        </span>
        <span className="text-xs text-white/40 shrink-0">{timeLabel(swing.time)}</span>
      </div>
    </button>
  )
}

function PlayerGroups({ swings, onOpen }: { swings: Swing[]; onOpen: (s: Swing) => void }) {
  const groups = groupByPlayer(swings)
  const showHeaders = groups.some((g) => g.player !== null)
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.player ?? NO_PLAYER} className="flex flex-col gap-2.5">
          {showHeaders && (
            <div className="flex items-center gap-2">
              <Folder size={15} className="text-white/35" />
              <h3 className="text-sm font-semibold text-white/80">{g.player ?? 'No player'}</h3>
              <span className="text-xs text-white/35">{plural(g.swings.length, 'swing')}</span>
            </div>
          )}
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]">
            {g.swings.map((s) => <SwingCard key={s.key} swing={s} onOpen={onOpen} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function Tile({
  icon: Icon, title, sub, onClick, tone = 'default', active = false
}: {
  icon: React.ComponentType<any>
  title: string
  sub: string
  onClick: () => void
  tone?: 'default' | 'accent' | 'amber'
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 p-2 rounded-xl border text-left transition-colors',
        tone === 'accent' && 'bg-accent-500/10 border-accent-500/25 hover:border-accent-500/60',
        tone === 'amber' && 'bg-amber-500/10 border-amber-500/25 hover:border-amber-500/60',
        tone === 'default' && 'bg-surface-800 border-white/5 hover:border-white/20',
        active && 'border-red-500/50'
      )}
    >
      <span
        className={cn(
          'w-20 h-14 shrink-0 rounded-lg flex items-center justify-center',
          tone === 'accent' ? 'bg-accent-500/15 text-accent-400'
            : tone === 'amber' ? 'bg-amber-500/15 text-amber-400'
            : active ? 'bg-red-500/15 text-red-400'
            : 'bg-white/5 text-white/70'
        )}
      >
        <Icon size={24} strokeWidth={1.6} />
      </span>
      <span className="flex flex-col min-w-0">
        <span className={cn('text-sm font-semibold', tone === 'amber' ? 'text-amber-400' : 'text-white/85')}>{title}</span>
        <span className="text-xs text-white/45 truncate">{sub}</span>
      </span>
    </button>
  )
}

export function HomeView() {
  const setRoute = useUiStore((s) => s.setRoute)
  const streamOpen = useUiStore((s) => s.streamWindowOpen)
  const [files, setFiles] = useState<RecordingFile[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [playerFilter, setPlayerFilter] = useState<string>(ALL)
  const [openDays, setOpenDays] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list: RecordingFile[] = (await api()?.fs.listRecordings?.()) ?? []
      setFiles(list)
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const days: Day[] = useMemo(() => groupDays(files ?? []), [files])
  const todayKey = dayKeyOf(new Date())
  const today = days.find((d) => d.dayKey === todayKey)
  const earlier = days.filter((d) => d.dayKey !== todayKey)

  // Player filter chips for today (only worth showing once players are in use)
  const todayPlayers = useMemo(() => {
    if (!today) return []
    const counts = new Map<string, number>()
    for (const s of today.swings) {
      const k = s.player ?? NO_PLAYER
      counts.set(k, (counts.get(k) ?? 0) + s.clips.length)
    }
    return [...counts.entries()]
  }, [today])
  const showChips = todayPlayers.some(([k]) => k !== NO_PLAYER)
  const todaySwings = (today?.swings ?? []).filter((s) =>
    playerFilter === ALL || (s.player ?? NO_PLAYER) === playerFilter
  )

  // Open a swing in Analyze: two angles → side by side, like a fresh capture
  const openSwing = useCallback((swing: Swing) => {
    const clipStore = useClipStore.getState()
    const resolved: Clip[] = swing.clips.map((c) => clipStore.clips.find((x) => x.filePath === c.filePath) ?? c)
    for (const c of [...resolved].reverse()) {
      if (!useClipStore.getState().clips.some((x) => x.filePath === c.filePath)) clipStore.addClip(c)
    }
    const comparison = useComparisonStore.getState()
    if (resolved.length >= 2) {
      pairedStart.expect([resolved[0].filePath, resolved[1].filePath])
      comparison.setRightClip(resolved[1])
      comparison.setDualMode(true)
    } else {
      comparison.setDualMode(false)
    }
    useAnalysisStore.getState().setActiveClip(resolved[0])
    setRoute('analyze')
  }, [setRoute])

  // Import goes through Analyze's trim + convert screen
  const startImport = useCallback((path: string) => {
    if (!path) return
    useAnalysisStore.getState().setPendingImportPath(path)
    setRoute('analyze')
  }, [setRoute])

  const pickFile = async () => {
    const paths: string[] = await api()?.fs.openVideo()
    if (paths?.length) startImport(paths[0])
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) startImport(api()?.fs.getPathForFile(file) ?? '')
  }

  const toggleDay = (key: string) => {
    setOpenDays((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const todayDate = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-wrap items-start gap-6 p-6 max-w-[1600px] mx-auto">

        {/* ---------------- Recordings ---------------- */}
        <div className="flex-[999_1_560px] min-w-0 flex flex-col gap-5">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl font-semibold text-white/90">Today</h1>
            <span className="text-sm text-white/45">
              {todayDate}{today ? ` · ${plural(today.clipCount, 'clip')}` : ''}
            </span>
            <div className="flex-1" />
            <button
              onClick={load}
              disabled={loading}
              title="Look for new recordings"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-white/45 hover:text-white/85 hover:bg-white/5 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {showChips && (
            <div role="group" aria-label="Filter by player" className="flex flex-wrap gap-2">
              {[[ALL, today?.clipCount ?? 0] as [string, number], ...todayPlayers].map(([k, n]) => (
                <button
                  key={k}
                  aria-pressed={playerFilter === k}
                  onClick={() => setPlayerFilter(k)}
                  className={cn(
                    'h-9 px-4 rounded-full border text-sm transition-colors',
                    playerFilter === k
                      ? 'border-accent-500 bg-accent-500/15 text-white font-semibold'
                      : 'border-white/10 bg-surface-800 text-white/60 hover:text-white/90'
                  )}
                >
                  {k === ALL ? 'All' : k === NO_PLAYER ? 'No player' : k} · {n}
                </button>
              ))}
            </div>
          )}

          {files === null ? (
            <div className="h-40 flex items-center justify-center"><RefreshCw size={18} className="text-white/20 animate-spin" /></div>
          ) : todaySwings.length > 0 ? (
            <PlayerGroups swings={todaySwings} onOpen={openSwing} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 rounded-xl border border-dashed border-white/10 text-center">
              <Video size={28} className="text-white/20" />
              <p className="text-sm text-white/60">No swings recorded today yet</p>
              <div className="flex gap-2">
                <button onClick={() => setRoute('capture')} className="px-4 py-2 rounded-lg bg-accent-500 text-black text-sm font-semibold hover:bg-accent-400 transition-colors">
                  Start capturing
                </button>
                <button onClick={pickFile} className="px-4 py-2 rounded-lg border border-white/15 text-sm text-white/75 hover:text-white hover:border-white/30 transition-colors">
                  Import a video
                </button>
              </div>
            </div>
          )}

          {earlier.length > 0 && (
            <section className="flex flex-col gap-2 mt-2">
              <h2 className="text-base font-semibold text-white/80 mb-1">Earlier</h2>
              {earlier.slice(0, MAX_EARLIER_DAYS).map((d) => {
                const open = openDays.has(d.dayKey)
                return (
                  <div key={d.dayKey} className="flex flex-col gap-3">
                    <button
                      onClick={() => toggleDay(d.dayKey)}
                      aria-expanded={open}
                      className="flex items-center gap-3 min-h-[48px] px-4 rounded-lg bg-surface-800/60 border border-white/5 hover:border-white/15 text-left transition-colors"
                    >
                      {open ? <ChevronDown size={15} className="text-white/45" /> : <ChevronRight size={15} className="text-white/45" />}
                      <span className="flex-1 text-sm font-medium text-white/80">{dayLabel(d.date)}</span>
                      <span className="text-xs text-white/40">{plural(d.swings.length, 'swing')} · {plural(d.clipCount, 'clip')}</span>
                    </button>
                    {open && <div className="pl-2 pb-2"><PlayerGroups swings={d.swings} onOpen={openSwing} /></div>}
                  </div>
                )
              })}
              {earlier.length > MAX_EARLIER_DAYS && (
                <button
                  onClick={() => api()?.settings.openRecordingsDir()}
                  className="self-start flex items-center gap-1.5 mt-1 px-2 py-1.5 rounded text-xs text-white/45 hover:text-white/85 hover:bg-white/5 transition-colors"
                >
                  <FolderOpen size={13} /> Older days are in the recordings folder
                </button>
              )}
            </section>
          )}
        </div>

        {/* ---------------- Quick actions ---------------- */}
        <aside aria-label="Quick actions" className="flex-[1_1_300px] max-w-[380px] flex flex-col gap-2.5">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center gap-2.5 px-4 py-6 mb-1 rounded-xl border-2 border-dashed text-center transition-colors',
              dragOver ? 'border-accent-500 bg-accent-500/10' : 'border-white/15 bg-surface-800/50'
            )}
          >
            <Download size={26} className="text-white/55" />
            <p className="text-sm font-semibold text-white/85">Drop a video here</p>
            <p className="text-xs text-white/40">Trim it, convert it, then analyze</p>
            <button onClick={pickFile} className="mt-1 px-4 py-2 rounded-lg bg-accent-500 text-black text-sm font-semibold hover:bg-accent-400 transition-colors">
              Import video
            </button>
          </div>

          <Tile icon={Video} title="Capture" sub="Start a session" tone="accent" onClick={() => setRoute('capture')} />
          <Tile icon={BarChart2} title="Analyze" sub="Scrub and draw" onClick={() => setRoute('analyze')} />
          <Tile
            icon={Columns}
            title="Compare"
            sub="Two swings side by side"
            onClick={() => { useComparisonStore.getState().setDualMode(true); setRoute('analyze') }}
          />
          <Tile icon={BookOpen} title="Library" sub="Your swing library folder" onClick={() => setRoute('library')} />
          <Tile
            icon={MonitorPlay}
            title="Stream window"
            sub={streamOpen ? 'Open — click to close' : 'Replay feed for OBS'}
            active={streamOpen}
            onClick={toggleStreamWindow}
          />
          <Tile icon={Settings} title="Settings" sub="Cameras, folders, hotkeys" onClick={() => setRoute('settings')} />
          <Tile icon={Globe} title="SendaSwing" sub="Opens sendaswing.com" tone="amber" onClick={() => window.open(SENDASWING_URL)} />
        </aside>
      </div>
    </div>
  )
}
