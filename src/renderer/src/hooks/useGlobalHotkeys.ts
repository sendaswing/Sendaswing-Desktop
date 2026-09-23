import { useEffect } from 'react'
import { useUiStore } from '../store/uiStore'
import { useSettingsStore } from '../store/settingsStore'
import { bufferedCapture } from '../lib/recording/BufferedCaptureController'

/**
 * The Record button in Standard mode registers itself here so the Save Swing
 * hotkey can start/stop a normal recording too.
 */
let standardRecordToggle: (() => void) | null = null
export function registerStandardRecordToggle(fn: (() => void) | null): void {
  standardRecordToggle = fn
}

/** Compare a KeyboardEvent to a stored key name; single letters ignore case. */
export function keyMatches(e: KeyboardEvent, key: string): boolean {
  if (!key) return false
  if (key.length === 1 && e.key.length === 1) return e.key.toLowerCase() === key.toLowerCase()
  return e.key === key
}

/** Friendly label for a stored key name (for buttons/tooltips). */
export function keyLabel(key: string): string {
  if (!key) return '—'
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key
}

/**
 * App-wide hotkeys:
 *  - Toggle Live/Replay (default Tab): Capture ⇄ Analyze. From any other
 *    screen it goes to Capture (live).
 *  - Save Swing (default S), Capture screen only: in Buffered mode saves the
 *    last few seconds right now; in Standard mode starts/stops recording.
 */
export function useGlobalHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return
      const t = e.target as HTMLElement | null
      // Don't steal keys while typing text (search box, number fields)
      if (t instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button'].includes(t.type)) return
      if (t && (t instanceof HTMLTextAreaElement || t.isContentEditable)) return
      // The Settings screen captures keys while re-binding a hotkey
      if (t?.closest?.('[data-hotkey-capture]')) return

      const { toggleLiveKey, saveSwingKey, captureMode } = useSettingsStore.getState()
      const { route, setRoute } = useUiStore.getState()

      if (keyMatches(e, toggleLiveKey)) {
        e.preventDefault()
        e.stopPropagation()
        // A focused dropdown/button would otherwise keep eating keys after the switch
        if (t && t !== document.body) t.blur?.()
        setRoute(route === 'capture' ? 'analyze' : 'capture')
        return
      }

      if (route === 'capture' && keyMatches(e, saveSwingKey)) {
        e.preventDefault()
        e.stopPropagation()
        if (t && t !== document.body) t.blur?.()
        if (captureMode === 'buffered') void bufferedCapture.trigger()
        else standardRecordToggle?.()
      }
    }
    // Capture phase so these win over view-level shortcuts (e.g. Analyze's keys)
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}
