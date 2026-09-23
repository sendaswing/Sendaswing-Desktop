import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

/** 'standard' = countdown + Record button; 'buffered' = always-rolling pre-roll, saved on a trigger. */
export type CaptureMode = 'standard' | 'buffered'

interface SettingsStore {
  recordingsDir: string
  libraryDir: string
  recordingDelay: number
  recordingDuration: number

  // Buffered capture
  captureMode: CaptureMode
  /** Seconds of video kept from BEFORE the trigger (the backswing). */
  preRollSec: number
  /** Seconds of video kept AFTER the trigger (follow-through). */
  postRollSec: number
  /** Audio input used to hear the strike. '' = sound trigger off (hotkey only). */
  triggerMicId: string
  /** Peak level (dBFS, -60..0) the trigger mic must reach to save a swing. */
  triggerThresholdDb: number
  /** After a buffered capture, jump to Analyze and play the swing. */
  autoReplay: boolean
  /** Speed clips auto-play at when they open in Analyze. */
  replaySpeed: number

  // Hotkeys (KeyboardEvent.key values)
  toggleLiveKey: string
  saveSwingKey: string

  setRecordingsDir: (dir: string) => void
  setLibraryDir: (dir: string) => void
  setRecordingDelay: (n: number) => void
  setRecordingDuration: (n: number) => void
  setCaptureMode: (m: CaptureMode) => void
  setPreRollSec: (n: number) => void
  setPostRollSec: (n: number) => void
  setTriggerMicId: (id: string) => void
  setTriggerThresholdDb: (db: number) => void
  setAutoReplay: (v: boolean) => void
  setReplaySpeed: (n: number) => void
  setToggleLiveKey: (k: string) => void
  setSaveSwingKey: (k: string) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set) => ({
      recordingsDir: '',
      libraryDir: '',
      recordingDelay: 3,
      recordingDuration: 6,

      captureMode: 'standard',
      preRollSec: 3,
      postRollSec: 2,
      triggerMicId: '',
      triggerThresholdDb: -15,
      autoReplay: true,
      replaySpeed: 0.25,

      toggleLiveKey: 'Tab',
      saveSwingKey: 's',

      setRecordingsDir: (dir) => { set((s) => { s.recordingsDir = dir }) },
      setLibraryDir: (dir) => { set((s) => { s.libraryDir = dir }) },
      setRecordingDelay: (n) => { set((s) => { s.recordingDelay = n }) },
      setRecordingDuration: (n) => { set((s) => { s.recordingDuration = n }) },
      setCaptureMode: (m) => { set((s) => { s.captureMode = m }) },
      setPreRollSec: (n) => { set((s) => { s.preRollSec = n }) },
      setPostRollSec: (n) => { set((s) => { s.postRollSec = n }) },
      setTriggerMicId: (id) => { set((s) => { s.triggerMicId = id }) },
      setTriggerThresholdDb: (db) => { set((s) => { s.triggerThresholdDb = db }) },
      setAutoReplay: (v) => { set((s) => { s.autoReplay = v }) },
      setReplaySpeed: (n) => { set((s) => { s.replaySpeed = n }) },
      setToggleLiveKey: (k) => { set((s) => { s.toggleLiveKey = k }) },
      setSaveSwingKey: (k) => { set((s) => { s.saveSwingKey = k }) }
    })),
    {
      name: 'snds-settings',
      partialize: (s) => ({
        recordingDelay: s.recordingDelay,
        recordingDuration: s.recordingDuration,
        captureMode: s.captureMode,
        preRollSec: s.preRollSec,
        postRollSec: s.postRollSec,
        triggerMicId: s.triggerMicId,
        triggerThresholdDb: s.triggerThresholdDb,
        autoReplay: s.autoReplay,
        replaySpeed: s.replaySpeed,
        toggleLiveKey: s.toggleLiveKey,
        saveSwingKey: s.saveSwingKey
      })
    }
  )
)
