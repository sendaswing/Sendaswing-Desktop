import React, { useEffect } from 'react'
import { FolderOpen, Film } from 'lucide-react'
import { useClipStore } from '../../store/clipStore'
import { useAnalysisStore } from '../../store/analysisStore'
import { cn } from '../../lib/utils/cn'
import { formatDuration } from '../../lib/utils/formatTime'
import type { Clip } from '../../types/clip'

export function ClipBrowser() {
  const { clips, addClip } = useClipStore()
  const { activeClip, setActiveClip } = useAnalysisStore()

  const openFile = async () => {
    const paths: string[] = await (window as any).electronAPI?.fs.openVideo()
    if (!paths?.length) return

    for (const filePath of paths) {
      const name = filePath.split('/').pop() ?? filePath
      const clip: Clip = {
        id: `clip-${Date.now()}-${Math.random()}`,
        name,
        filePath,
        duration: 0,
        fps: 30,
        frameCount: 0,
        thumbnailPath: null,
        recordedAt: new Date().toISOString(),
        cameraLabel: 'Imported',
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
            <span className="text-xs">No clips yet</span>
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
    </div>
  )
}

function ClipItem({ clip, isActive, onClick }: { clip: Clip; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2 border-b border-white/5 transition-colors',
        isActive ? 'bg-accent-500/15 border-l-2 border-l-accent-500' : 'hover:bg-white/5'
      )}
    >
      <p className="text-xs text-white/80 truncate font-medium">{clip.name}</p>
      <p className="text-xs text-white/30 mt-0.5">{clip.cameraLabel}</p>
    </button>
  )
}
