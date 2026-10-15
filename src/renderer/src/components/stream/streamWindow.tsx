/**
 * Opens / closes the "SaS Stream" window for OBS.
 *
 * The window is created with window.open() from the main window, so it runs in
 * the same process and shares the same JavaScript: StreamView reads the same
 * Zustand stores and plays the very same camera MediaStreams the Capture screen
 * uses. The cameras are never opened twice (Windows usually only lets one
 * program — or one window — own a USB camera at a time).
 *
 * The main process (src/main/index.ts) recognises the window name below and
 * gives it a 1920×1080 content area with background throttling off.
 *
 * In OBS: Sources → + → Window Capture → Window: "[electron.exe]: SaS Stream"
 * (or the installed app's .exe), Capture Method: "Windows 10 (1903 and up)".
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { StreamView } from './StreamView'
import { useUiStore } from '../../store/uiStore'
import { handleGlobalHotkey } from '../../hooks/useGlobalHotkeys'

/** Must match STREAM_WINDOW_NAME in src/main/index.ts. */
const WINDOW_NAME = 'sas-stream'
export const STREAM_WINDOW_TITLE = 'SaS Stream'

const BASE_CSS = `
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
  * { box-sizing: border-box; }
`

let streamWin: Window | null = null
let root: Root | null = null
let closeWatch: ReturnType<typeof setInterval> | null = null

export function isStreamWindowOpen(): boolean {
  return !!streamWin && !streamWin.closed
}

export function openStreamWindow(): void {
  if (streamWin && !streamWin.closed) {
    streamWin.focus()
    return
  }

  const win = window.open('', WINDOW_NAME, 'width=1920,height=1080')
  if (!win) {
    useUiStore.getState().showToast("Couldn't open the stream window", 'error')
    return
  }
  streamWin = win

  const doc = win.document
  doc.title = STREAM_WINDOW_TITLE
  const style = doc.createElement('style')
  style.textContent = BASE_CSS
  doc.head.appendChild(style)
  doc.body.replaceChildren()
  const container = doc.createElement('div')
  doc.body.appendChild(container)

  root = createRoot(container)
  root.render(<StreamView />)

  // Pedal / keyboard presses while the stream window has focus still reach the app
  win.addEventListener('keydown', handleGlobalHotkey, true)

  // Notice when the user closes the window with its X
  if (closeWatch) clearInterval(closeWatch)
  closeWatch = setInterval(() => {
    if (!streamWin || streamWin.closed) cleanup()
  }, 1000)

  useUiStore.getState().setStreamWindowOpen(true)
}

export function closeStreamWindow(): void {
  const win = streamWin
  cleanup()
  if (win && !win.closed) win.close()
}

export function toggleStreamWindow(): void {
  if (isStreamWindowOpen()) closeStreamWindow()
  else openStreamWindow()
}

function cleanup(): void {
  if (closeWatch) { clearInterval(closeWatch); closeWatch = null }
  try { root?.unmount() } catch { /* window already gone */ }
  root = null
  streamWin = null
  useUiStore.getState().setStreamWindowOpen(false)
}

// Reloading or closing the main window takes the stream window with it
window.addEventListener('beforeunload', () => closeStreamWindow())
