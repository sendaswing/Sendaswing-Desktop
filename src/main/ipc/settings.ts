import { ipcMain, app, dialog, shell } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

/**
 * How Chromium talks to the cameras on Windows.
 *  - 'standard'      Media Foundation (Chromium's default)
 *  - 'compatibility' DirectShow — the older path. Some camera drivers crash
 *                    Chromium's camera process under Media Foundation but
 *                    work fine here. Takes effect after a restart.
 */
export type CameraBackend = 'standard' | 'compatibility'

interface AppSettings {
  recordingsDir: string
  libraryDir: string
  cameraBackend?: CameraBackend
}

function readSettings(): AppSettings {
  try {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8')
    return { libraryDir: '', ...JSON.parse(raw) } as AppSettings
  } catch {
    return { recordingsDir: join(app.getPath('userData'), 'recordings'), libraryDir: '' }
  }
}

function writeSettings(settings: AppSettings): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8')
}

export function getCameraBackend(): CameraBackend {
  return readSettings().cameraBackend === 'compatibility' ? 'compatibility' : 'standard'
}

/** The mode this run of the app started with (what Chromium is actually using). */
const RUNNING_CAMERA_BACKEND: CameraBackend = getCameraBackend()

export function setCameraBackend(backend: CameraBackend): void {
  const settings = readSettings()
  settings.cameraBackend = backend
  writeSettings(settings)
}

/**
 * Default Library folder: Brendan's shared Google Drive "Swing Database",
 * found wherever Google Drive for Desktop is mounted (usually G:, but the
 * letter can differ per PC). Used only while no Library folder has been
 * chosen in Settings, and only if the folder actually exists on this PC.
 */
const DEFAULT_LIBRARY_SUBPATH = join('My Drive', 'Swing Database')

function findDefaultLibraryDir(): string {
  if (process.platform !== 'win32') return ''
  const letters = 'GDEFHIJKLMNOPQRSTUVWXYZ'
  for (const letter of letters) {
    const candidate = join(`${letter}:\\`, DEFAULT_LIBRARY_SUBPATH)
    try {
      if (existsSync(candidate)) return candidate
    } catch { /* drive not ready */ }
  }
  return ''
}

/** The chosen Library folder, or the Drive default when none has been chosen. */
export function getLibraryDir(): string {
  const chosen = readSettings().libraryDir ?? ''
  return chosen || findDefaultLibraryDir()
}

export function getRecordingsDir(): string {
  return readSettings().recordingsDir
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get-recordings-dir', () => {
    const dir = getRecordingsDir()
    mkdirSync(dir, { recursive: true })
    return dir
  })

  ipcMain.handle('settings:set-recordings-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose Recordings Folder',
      defaultPath: getRecordingsDir(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null

    const newDir = result.filePaths[0]
    mkdirSync(newDir, { recursive: true })
    const settings = readSettings()
    settings.recordingsDir = newDir
    writeSettings(settings)
    return newDir
  })

  ipcMain.handle('settings:open-recordings-dir', async () => {
    const dir = getRecordingsDir()
    mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
  })

  ipcMain.handle('settings:get-library-dir', () => getLibraryDir())

  ipcMain.handle('settings:set-library-dir', async () => {
    const current = getLibraryDir()
    const result = await dialog.showOpenDialog({
      title: 'Choose Library Folder',
      defaultPath: current || app.getPath('home'),
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null

    const newDir = result.filePaths[0]
    const settings = readSettings()
    settings.libraryDir = newDir
    writeSettings(settings)
    return newDir
  })

  ipcMain.handle('settings:get-camera-backend', () => ({ saved: getCameraBackend(), running: RUNNING_CAMERA_BACKEND }))
  ipcMain.handle('settings:set-camera-backend', (_e, backend: CameraBackend) => {
    setCameraBackend(backend === 'compatibility' ? 'compatibility' : 'standard')
    return getCameraBackend()
  })
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle('settings:open-library-dir', async () => {
    const dir = getLibraryDir()
    if (!dir) return
    await shell.openPath(dir)
  })
}
