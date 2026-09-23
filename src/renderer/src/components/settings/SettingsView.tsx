import React, { useEffect, useState } from 'react'
import { FolderOpen, FolderInput, CheckCircle, Keyboard } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import { keyLabel } from '../../hooks/useGlobalHotkeys'
import { cn } from '../../lib/utils/cn'

/** Keys Analyze already uses — binding a hotkey to one of these would break playback controls. */
const RESERVED_KEYS = new Set([' ', 'ArrowLeft', 'ArrowRight', ',', '.', 'j', 'k', 'l', 'Escape'])
const REPLAY_SPEEDS = [0.1, 0.25, 0.5, 1]

function HotkeyButton({ value, other, onChange }: { value: string; other: string; onChange: (k: string) => void }) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex items-center gap-2 shrink-0">
      {error && <span className="text-xs text-amber-400/80">{error}</span>}
      <button
        data-hotkey-capture
        onClick={() => { setListening(true); setError(null) }}
        onBlur={() => setListening(false)}
        onKeyDown={(e) => {
          if (!listening) return
          e.preventDefault()
          e.stopPropagation()
          if (e.key === 'Escape') { setListening(false); return }
          if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return
          const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
          if (RESERVED_KEYS.has(key)) { setError(`${keyLabel(key)} is used by playback`); return }
          if (other && key.toLowerCase() === other.toLowerCase()) { setError('Already used by the other hotkey'); return }
          onChange(key)
          setListening(false)
          setError(null)
        }}
        className={cn(
          'min-w-[84px] px-2 py-1 rounded border text-xs font-mono transition-colors',
          listening ? 'border-accent-500/70 bg-accent-500/10 text-accent-400' : 'border-white/10 bg-black/30 text-white/80 hover:border-white/25'
        )}
      >
        {listening ? 'Press a key…' : keyLabel(value)}
      </button>
    </div>
  )
}

function NumericInput({ value, min, max, step = 1, onChange }: { value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => {
        const n = Math.max(min, Math.min(max, Number(e.target.value)))
        if (!isNaN(n)) onChange(n)
      }}
      className="w-16 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white/80 font-mono text-right outline-none focus:border-accent-500/50"
    />
  )
}

const api = () => (window as any).electronAPI?.settings

export function SettingsView() {
  const {
    recordingsDir, setRecordingsDir, libraryDir, setLibraryDir, recordingDelay, setRecordingDelay, recordingDuration, setRecordingDuration,
    preRollSec, setPreRollSec, postRollSec, setPostRollSec, autoReplay, setAutoReplay, replaySpeed, setReplaySpeed,
    toggleLiveKey, setToggleLiveKey, saveSwingKey, setSaveSwingKey
  } = useSettingsStore()
  const [recSaved, setRecSaved] = useState(false)
  const [libSaved, setLibSaved] = useState(false)

  useEffect(() => {
    api()?.getRecordingsDir().then((dir: string) => { if (dir) setRecordingsDir(dir) })
    api()?.getLibraryDir().then((dir: string) => { if (dir) setLibraryDir(dir) })
  }, [])

  const handleOpenRecordings = async () => { await api()?.openRecordingsDir() }
  const handleChangeRecordings = async () => {
    const newDir: string | null = await api()?.setRecordingsDir()
    if (newDir) { setRecordingsDir(newDir); setRecSaved(true); setTimeout(() => setRecSaved(false), 2000) }
  }

  const handleOpenLibrary = async () => { await api()?.openLibraryDir() }
  const handleChangeLibrary = async () => {
    const newDir: string | null = await api()?.setLibraryDir()
    if (newDir) { setLibraryDir(newDir); setLibSaved(true); setTimeout(() => setLibSaved(false), 2000) }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-base font-semibold text-white/80 mb-6 tracking-wide uppercase">Settings</h1>

      <div className="max-w-xl space-y-8">
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-white/60 mb-1">Recording Location</h2>
            <p className="text-xs text-white/30 mb-3">Swing videos recorded from live cameras are saved here.</p>
          </div>
          <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2">
            <FolderOpen size={14} className="text-white/40 shrink-0" />
            <span className="text-xs text-white/70 font-mono truncate flex-1 select-all">{recordingsDir || '—'}</span>
            {recSaved && <CheckCircle size={14} className="text-accent-400 shrink-0" />}
          </div>
          <div className="flex gap-2">
            <button onClick={handleOpenRecordings} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/60 hover:text-white/90 transition-colors">
              <FolderOpen size={13} /> Open Folder
            </button>
            <button onClick={handleChangeRecordings} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/60 hover:text-white/90 transition-colors">
              <FolderInput size={13} /> Change Location
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-white/60 mb-1">Recording</h2>
            <p className="text-xs text-white/30 mb-3">Pre-recording countdown and auto-stop duration for each swing.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-black/30 border border-white/10 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-white/70">Pre-recording delay</p>
                <p className="text-xs text-white/30">Countdown seconds before cameras start (0 = instant)</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <NumericInput value={recordingDelay} min={0} max={10} onChange={setRecordingDelay} />
                <span className="text-xs text-white/30">s</span>
              </div>
            </div>
            <div className="flex items-center justify-between bg-black/30 border border-white/10 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-white/70">Recording duration</p>
                <p className="text-xs text-white/30">Auto-stop after this many seconds (0 = manual stop)</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <NumericInput value={recordingDuration} min={0} max={30} onChange={setRecordingDuration} />
                <span className="text-xs text-white/30">s</span>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-white/60 mb-1">Buffered Capture</h2>
            <p className="text-xs text-white/30 mb-3">
              In Buffered mode the cameras keep the last few seconds in memory. When the trigger mic hears the strike
              (or you press the Save Swing key) the swing is saved with the backswing already in it.
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-black/30 border border-white/10 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-white/70">Before the strike</p>
                <p className="text-xs text-white/30">Seconds kept before impact (setup + backswing)</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <NumericInput value={preRollSec} min={1} max={10} step={0.5} onChange={setPreRollSec} />
                <span className="text-xs text-white/30">s</span>
              </div>
            </div>
            <div className="flex items-center justify-between bg-black/30 border border-white/10 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-white/70">After the strike</p>
                <p className="text-xs text-white/30">Seconds kept after impact (follow-through)</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <NumericInput value={postRollSec} min={0.5} max={5} step={0.5} onChange={setPostRollSec} />
                <span className="text-xs text-white/30">s</span>
              </div>
            </div>
            <label className="flex items-center justify-between bg-black/30 border border-white/10 rounded-lg px-3 py-2 cursor-pointer">
              <div>
                <p className="text-xs text-white/70">Replay after each swing</p>
                <p className="text-xs text-white/30">Jump to Analyze and play the swing in slow motion as soon as it's saved</p>
              </div>
              <input
                type="checkbox"
                checked={autoReplay}
                onChange={(e) => setAutoReplay(e.target.checked)}
                className="w-4 h-4 accent-green-500 shrink-0"
              />
            </label>
            <div className="flex items-center justify-between bg-black/30 border border-white/10 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-white/70">Replay speed</p>
                <p className="text-xs text-white/30">Speed clips play at when they open in Analyze</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {REPLAY_SPEEDS.map((sp) => (
                  <button
                    key={sp}
                    onClick={() => setReplaySpeed(sp)}
                    className={cn(
                      'px-2 py-0.5 rounded text-xs font-mono transition-colors',
                      replaySpeed === sp ? 'bg-accent-500/30 text-accent-400' : 'text-white/35 hover:text-white/70 hover:bg-white/5'
                    )}
                  >
                    {sp}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-white/60 mb-1 flex items-center gap-1.5"><Keyboard size={14} /> Hotkeys</h2>
            <p className="text-xs text-white/30 mb-3">Click a key box, then press the key you want. Works with most presentation clickers and foot pedals.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-black/30 border border-white/10 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-white/70">Toggle Live ⇄ Replay</p>
                <p className="text-xs text-white/30">Switch between the live cameras and the last swing in Analyze</p>
              </div>
              <HotkeyButton value={toggleLiveKey} other={saveSwingKey} onChange={setToggleLiveKey} />
            </div>
            <div className="flex items-center justify-between bg-black/30 border border-white/10 rounded-lg px-3 py-2">
              <div>
                <p className="text-xs text-white/70">Save Swing</p>
                <p className="text-xs text-white/30">Capture screen: save the buffered swing now (Standard mode: start/stop recording)</p>
              </div>
              <HotkeyButton value={saveSwingKey} other={toggleLiveKey} onChange={setSaveSwingKey} />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-white/60 mb-1">Library Folder</h2>
            <p className="text-xs text-white/30 mb-3">Tour/reference swing videos shown in the Library tab for comparison.</p>
          </div>
          <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2">
            <FolderOpen size={14} className="text-white/40 shrink-0" />
            <span className="text-xs text-white/70 font-mono truncate flex-1 select-all">{libraryDir || '—'}</span>
            {libSaved && <CheckCircle size={14} className="text-accent-400 shrink-0" />}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleOpenLibrary}
              disabled={!libraryDir}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/60 hover:text-white/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FolderOpen size={13} /> Open Folder
            </button>
            <button onClick={handleChangeLibrary} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/60 hover:text-white/90 transition-colors">
              <FolderInput size={13} /> Change Location
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
