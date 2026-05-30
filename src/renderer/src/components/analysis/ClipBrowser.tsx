import React, { useEffect, useRef, useState } from 'react'
import { FolderOpen, Film } from 'lucide-react'
import { useClipStore } from '../../store/clipStore'
import { useAnalysisStore } from '../../store/analysisStore'
import { cn } from '../../lib/utils/cn'
import type { Clip, CameraAngle, ClubType } from '../../types/clip'

const ANGLES: CameraAngle[] = ['FO', 'DL', 'Other']
const CLUBS: ClubType[] = ['Driver', 'Iron', 'Wedge', 'FW', 'Hybrid', 'Putt']

export function ClipBrowser() {
  const { clips, addClip } = useClipStore()
  const { activeClip, setActiveClip } = useAnalysisStore()

  const openFile = async () => {
    const paths: string[] = await (window as any).electronAPI?.fs.openVideo()
    if (!paths?.length) return

    for (const filePath of paths) {
      const name = filePath.split(/[\\/]/).pop() ?? filePath
      const clip: Clip = {
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        filePath,
        duration: 0,
        fps: 30,
        frameCount: 0,
        thumbnailPath: null,
        recordedAt: new Date().toISOString(),
        cameraLabel: 'Imported',
        cameraAngle: '',
        club: '',
        tags: [],
        annotations: []
      }
      addClip(clip)
    }
  }

  return (
    <div className="flex flex-col h-full w-52 shrink-0 bg-surface-800 border-r border-white/5">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">Clips</span>
        <button
          onClick={openFile}
          title="Open video file"
          className="p-1 rounded text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
        >
          <FolderOpen size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {clips.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-white/20">
            <Film size={24} />
            <span className="text-xs text-center px-4">Open a video file to begin</span>
          </div>
        ) : (
          clips.map((clip) => (
            <ClipItem
              key={clip.id}
              clip={clip}
              isActive={activeClip?.id === clip.id}
              onClick={() => setActiveClip(clip)}
            />
          ))
        )}
      </div>

      {activeClip && <TagEditor clipId={activeClip.id} />}
    </div>
  )
}

function TagEditor({ clipId }: { clipId: string }) {
  const { clips, updateClipMeta } = useClipStore()
  const clip = clips.find((c) => c.id === clipId)
  if (!clip) return null

  return (
    <div className="border-t border-white/10 p-2 space-y-1.5 shrink-0">
      <p className="text-xs text-white/25 uppercase tracking-wider font-semibold">Tags</p>
      <div className="flex flex-wrap gap-1">
        {ANGLES.map((angle) => (
          <button
            key={angle}
            onClick={() => updateClipMeta(clipId, { cameraAngle: clip.cameraAngle === angle ? '' : angle })}
            className={cn(
              'px-2 py-0.5 rounded text-xs font-mono transition-colors',
              clip.cameraAngle === angle
                ? 'bg-accent-500 text-black font-bold'
                : 'bg-white/5 text-white/35 hover:text-white/70 hover:bg-white/10'
            )}
          >
            {angle}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {CLUBS.map((club) => (
          <button
            key={club}
            onClick={() => updateClipMeta(clipId, { club: clip.club === club ? '' : club })}
            className={cn(
              'px-2 py-0.5 rounded text-xs transition-colors',
              clip.club === club
                ? 'bg-white/20 text-white font-semibold'
                : 'bg-white/5 text-white/30 hover:text-white/60 hover:bg-white/10'
            )}
          >
            {club}
          </button>
        ))}
      </div>
    </div>
  )
}

function ClipItem({ clip, isActive, onClick }: { clip: Clip; isActive: boolean; onClick: () => void }) {
  const thumbCanvasRef = useRef<HTMLCanvasElement>(null)
  const [thumbReady, setThumbReady] = useState(false)

  useEffect(() => {
    let revoke = ''
    const canvas = thumbCanvasRef.current
    if (!canvas) return

    const generate = async () => {
      try {
        const buffer: ArrayBuffer = await (window as any).electronAPI.fs.readFileAsBuffer(clip.filePath)
        const blob = new Blob([buffer])
        const url = URL.createObjectURL(blob)
        revoke = url

        const video = document.createElement('video')
        video.src = url
        video.muted = true
        video.preload = 'metadata'

        video.onloadedmetadata = () => {
          video.currentTime = Math.min(1, video.duration * 0.1)
        }

        video.onseeked = () => {
          const ctx = canvas.getContext('2d')
          if (!ctx) return
          canvas.width = 192
          canvas.height = 108
          ctx.drawImage(video, 0, 0, 192, 108)
          setThumbReady(true)
          URL.revokeObjectURL(url)
        }
      } catch {}
    }

    generate()
    return () => { if (revoke) URL.revokeObjectURL(revoke) }
  }, [clip.filePath])

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left border-b border-white/5 transition-colors overflow-hidden',
        isActive ? 'bg-accent-500/15 border-l-2 border-l-accent-500' : 'hover:bg-white/5'
      )}
    >
      <div className="relative w-full aspect-video bg-black/60">
        <canvas
          ref={thumbCanvasRef}
          className={cn('w-full h-full object-cover', thumbReady ? 'opacity-100' : 'opacity-0')}
        />
        {!thumbReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film size={18} className="text-white/20" />
          </div>
        )}
        {(clip.cameraAngle || clip.club) && (
          <div className="absolute bottom-1 right-1 flex gap-1">
            {clip.cameraAngle && (
              <span className="bg-accent-500/80 text-black text-xs font-bold font-mono px-1 py-0.5 rounded leading-none">
                {clip.cameraAngle}
              </span>
            )}
            {clip.club && (
              <span className="bg-black/60 text-white/70 text-xs px-1 py-0.5 rounded leading-none">
                {clip.club}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className="text-xs text-white/80 truncate font-medium">{clip.name}</p>
        <p className="text-xs text-white/30">{clip.cameraLabel}</p>
      </div>
    </button>
  )
}
