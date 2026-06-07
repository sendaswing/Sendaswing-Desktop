import React, { useEffect, useRef, useState, useCallback } from 'react'
import { BookOpen, Search, Settings } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { useAnalysisStore } from '../../store/analysisStore'
import { makeSemaphore } from '../../lib/utils/semaphore'
import type { Clip } from '../../types/clip'
import type { AppRoute } from '../layout/Sidebar'

interface LibraryViewProps {
  onNavigate: (route: AppRoute) => void
}

interface LibraryFile {
  name: string
  filePath: string
}

function VideoThumbnail({
  file,
  onClick,
  semaphore
}: {
  file: LibraryFile
  onClick: () => void
  semaphore: ReturnType<typeof makeSemaphore>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadThumbnail = useCallback(async () => {
    if (thumbUrl || loading) return
    setLoading(true)
    try {
      // Fast path: OS shell thumbnail cache (near-instant for MP4)
      const dataUrl: string | null = await (window as any).electronAPI.fs.getThumbnail(file.filePath)
      if (dataUrl) { setThumbUrl(dataUrl); return }

      // Fallback: seek video element
      await semaphore.acquire()
      let objectUrl = ''
      try {
        const buffer: ArrayBuffer = await (window as any).electronAPI.fs.readFileAsBuffer(file.filePath)
        const blob = new Blob([buffer])
        objectUrl = URL.createObjectURL(blob)
        const video = document.createElement('video')
        video.src = objectUrl
        video.muted = true
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
        const oc = new OffscreenCanvas(320, 180)
        oc.getContext('2d')!.drawImage(video, 0, 0, 320, 180)
        const imgBitmap = oc.transferToImageBitmap()
        const canvas = document.createElement('canvas')
        canvas.width = 320; canvas.height = 180
        canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(imgBitmap)
        setThumbUrl(canvas.toDataURL('image/jpeg', 0.7))
      } catch {
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        semaphore.release()
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }, [file.filePath, thumbUrl, loading, semaphore])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { obs.disconnect(); loadThumbnail() } },
      { rootMargin: '200px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadThumbnail])

  return (
    <button
      onClick={onClick}
      className="group flex flex-col rounded-lg overflow-hidden bg-black/40 border border-white/5 hover:border-accent-500/40 transition-colors text-left"
    >
      <div ref={containerRef} className="relative aspect-video bg-black">
        {thumbUrl
          ? <img src={thumbUrl} className="w-full h-full object-cover" alt="" />
          : <div className="w-full h-full flex items-center justify-center text-white/10 text-xs">
              {loading ? 'Loading…' : ''}
            </div>
        }
      </div>
      <div className="px-2 py-1.5">
        <p className="text-xs text-white/60 group-hover:text-white/90 truncate transition-colors">{file.name}</p>
      </div>
    </button>
  )
}

export function LibraryView({ onNavigate }: LibraryViewProps) {
  const { libraryDir, setLibraryDir } = useSettingsStore()
  const { setActiveClip } = useAnalysisStore()
  const [files, setFiles] = useState<LibraryFile[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  // Stable semaphore for this mount — recreated only when component remounts
  const semaphoreRef = useRef(makeSemaphore(4))

  const scan = useCallback(async (dir: string) => {
    if (!dir) return
    setLoading(true)
    try {
      const result = await (window as any).electronAPI?.fs.scanDirectory(dir)
      setFiles(result?.files ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      const dir: string = await (window as any).electronAPI?.settings.getLibraryDir() ?? ''
      if (dir) { setLibraryDir(dir); scan(dir) }
    }
    load()
  }, [])

  useEffect(() => {
    if (libraryDir) scan(libraryDir)
  }, [libraryDir])

  const handleOpenClip = useCallback((file: LibraryFile) => {
    const clip: Clip = {
      id: `lib-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      filePath: file.filePath,
      duration: 0,
      fps: 30,
      frameCount: 0,
      thumbnailPath: null,
      recordedAt: new Date().toISOString(),
      cameraLabel: 'Library',
      cameraAngle: '',
      club: '',
      tags: [],
      annotations: []
    }
    setActiveClip(clip)
    onNavigate('analyze')
  }, [setActiveClip, onNavigate])

  const filtered = query
    ? files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    : files

  if (!libraryDir) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-white/30">
        <BookOpen size={40} strokeWidth={1} />
        <div className="text-center">
          <p className="text-sm mb-1">No library folder configured</p>
          <p className="text-xs text-white/20">Set a folder in Settings to browse tour swings</p>
        </div>
        <button
          onClick={() => onNavigate('settings')}
          className="flex items-center gap-1.5 px-4 py-2 rounded bg-white/5 hover:bg-white/10 text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          <Settings size={14} /> Configure in Settings
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 shrink-0">
        <Search size={14} className="text-white/30 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clips…"
          className="flex-1 bg-transparent text-sm text-white/80 placeholder:text-white/20 outline-none"
        />
        {loading && <span className="text-xs text-white/30">Loading…</span>}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="flex-1 flex items-center justify-center text-white/20 text-sm">
          {query ? 'No matches' : 'No video files found in folder'}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
          {filtered.map((file) => (
            <VideoThumbnail
              key={file.filePath}
              file={file}
              onClick={() => handleOpenClip(file)}
              semaphore={semaphoreRef.current}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
