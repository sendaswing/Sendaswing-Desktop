import React from 'react'
import { ClipBrowser } from './ClipBrowser'
import { VideoPlayer } from './VideoPlayer'
import { ToolPalette } from './ToolPalette'
import { useAnalysisStore } from '../../store/analysisStore'

export function AnalysisView() {
  const { activeClip } = useAnalysisStore()

  return (
    <div className="flex h-full">
      <ClipBrowser />
      <ToolPalette />
      <div className="flex-1 min-w-0">
        <VideoPlayer clipPath={activeClip?.filePath ?? null} />
      </div>
    </div>
  )
}
