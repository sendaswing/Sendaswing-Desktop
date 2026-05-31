import { ipcMain, app, dialog, shell } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

interface AppSettings {
  recordingsDir: string
  libraryDir: string
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

  ipcMain.handle('settings:get-library-dir', () => {
    return readSettings().libraryDir ?? ''
  })

  ipcMain.handle('settings:set-library-dir', async () => {
    const current = readSettings().libraryDir ?? ''
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

  ipcMain.handle('settings:open-library-dir', async () => {
    const dir = readSettings().libraryDir ?? ''
    if (!dir) return
    await shell.openPath(dir)
  })
}
