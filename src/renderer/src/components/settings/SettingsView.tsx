import React, { useEffect, useState } from 'react'
import { FolderOpen, FolderInput, CheckCircle } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'

const api = () => (window as any).electronAPI?.settings

export function SettingsView() {
  const { recordingsDir, setRecordingsDir } = useSettingsStore()
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api()?.getRecordingsDir().then((dir: string) => {
      if (dir) setRecordingsDir(dir)
    })
  }, [])

  const handleOpenFolder = async () => {
    await api()?.openRecordingsDir()
  }

  const handleChangeLocation = async () => {
    const newDir: string | null = await api()?.setRecordingsDir()
    if (newDir) {
      setRecordingsDir(newDir)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <h1 className="text-base font-semibold text-white/80 mb-6 tracking-wide uppercase">Settings</h1>

      <section className="max-w-xl space-y-3">
        <div>
          <h2 className="text-sm font-medium text-white/60 mb-1">Recording Location</h2>
          <p className="text-xs text-white/30 mb-3">
            Swing videos recorded from live cameras are saved here.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-black/30 border border-white/10 rounded-lg px-3 py-2">
          <FolderOpen size={14} className="text-white/40 shrink-0" />
          <span className="text-xs text-white/70 font-mono truncate flex-1 select-all">
            {recordingsDir || '—'}
          </span>
          {saved && <CheckCircle size={14} className="text-accent-400 shrink-0" />}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/60 hover:text-white/90 transition-colors"
          >
            <FolderOpen size={13} />
            Open Folder
          </button>
          <button
            onClick={handleChangeLocation}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-xs text-white/60 hover:text-white/90 transition-colors"
          >
            <FolderInput size={13} />
            Change Location
          </button>
        </div>
      </section>
    </div>
  )
}
