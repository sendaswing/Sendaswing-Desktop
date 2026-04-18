import { useEffect } from 'react'

interface ShortcutHandlers {
  onPlay?: () => void
  onPause?: () => void
  onTogglePlay?: () => void
  onStepForward?: () => void
  onStepBackward?: () => void
  onSpeedUp?: () => void
  onSpeedDown?: () => void
  onSeekForward?: (frames: number) => void
  onSeekBackward?: (frames: number) => void
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          handlers.onTogglePlay?.()
          break
        case 'ArrowRight':
          e.preventDefault()
          handlers.onStepForward?.()
          break
        case 'ArrowLeft':
          e.preventDefault()
          handlers.onStepBackward?.()
          break
        case '.':
          handlers.onSeekForward?.(10)
          break
        case ',':
          handlers.onSeekBackward?.(10)
          break
        case 'l':
        case 'L':
          handlers.onSpeedUp?.()
          break
        case 'j':
        case 'J':
          handlers.onSpeedDown?.()
          break
        case 'k':
        case 'K':
          handlers.onPause?.()
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlers])
}
