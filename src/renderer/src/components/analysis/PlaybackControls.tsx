import React from 'react'
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAnalysisStore } from '../../store/analysisStore'
import { formatTimecode } from '../../lib/utils/formatTime'
import { cn } from '../../lib/utils/cn'

const SPEEDS = [0.1, 0.25, 0.5, 1, 2]

interface PlaybackControlsProps {
  onPlay: (speed: number) => void
  onPause: () => void
  onStepForward: () => void
  onStepBackward: () => void
  isPlaying?: boolean
  playbackSpeed?: number
  currentFrame?: number
  fps?: number
  totalFrames?: number
  onSetPlaybackSpeed?: (speed: number) => void
}

export function PlaybackControls({
  onPlay, onPause, onStepForward, onStepBackward,
  isPlaying: isPlayingProp,
  playbackSpeed: playbackSpeedProp,
  currentFrame: currentFrameProp,
  fps: fpsProp,
  totalFrames: totalFramesProp,
  onSetPlaybackSpeed
}: PlaybackControlsProps) {
  const store = useAnalysisStore()
  const isPlaying = isPlayingProp ?? store.isPlaying
  const playbackSpeed = playbackSpeedProp ?? store.playbackSpeed
  const currentFrame = currentFrameProp ?? store.currentFrame
  const fps = fpsProp ?? store.fps
  const totalFrames = totalFramesProp ?? store.totalFrames

  const setSpeed = onSetPlaybackSpeed ?? store.setPlaybackSpeed

  const handlePlayToggle = () => {
    if (isPlaying) onPause()
    else onPlay(playbackSpeed)
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface-800 border-t border-white/5">
      <button onClick={onStepBackward} title="Step back (←)" className="icon-btn">
        <ChevronLeft size={16} />
      </button>

      <button onClick={handlePlayToggle} title="Play/Pause (Space)" className="icon-btn-lg">
        {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
      </button>

      <button onClick={onStepForward} title="Step forward (→)" className="icon-btn">
        <ChevronRight size={16} />
      </button>

      <div className="flex items-center gap-1 ml-2">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => { setSpeed(s); if (isPlaying) onPlay(s) }}
            className={cn(
              'px-1.5 py-0.5 rounded text-xs font-mono transition-colors',
              playbackSpeed === s ? 'bg-accent-500/30 text-accent-400' : 'text-white/30 hover:text-white/60 hover:bg-white/5'
            )}
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="ml-auto font-mono text-xs text-white/40">
        {formatTimecode(currentFrame, fps)} / {formatTimecode(totalFrames, fps)}
      </div>
    </div>
  )
}
