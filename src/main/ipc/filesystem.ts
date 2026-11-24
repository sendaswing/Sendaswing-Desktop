import { ipcMain, app, dialog, nativeImage } from 'electron'
import { mkdirSync, readdirSync } from 'fs'
import type { Dirent } from 'fs'
import { readFile, readdir, stat } from 'fs/promises'
import { join, extname } from 'path'
import { getRecordingsDir } from './settings'

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi'])

/** One video file found in the recordings folder (for the Home screen). */
export interface RecordingFile {
  name: string
  filePath: string
  /** Folders between the recordings folder and the file, e.g. ['2026-11-10', 'JohnSmith']. */
  relDir: string[]
  mtimeMs: number
}

/**
 * Every video in the recordings folder, newest first. Looks two folders deep so
 * the planned Recordings/<date>/<player>/ layout works as well as today's flat
 * folder. Unreadable folders are skipped rather than failing the whole scan.
 */
async function listRecordings(): Promise<RecordingFile[]> {
  const root = getRecordingsDir()
  if (!root) return []
  const out: RecordingFile[] = []

  const walk = async (dir: string, relDir: string[]): Promise<void> => {
    let entries: Dirent[] = []
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (relDir.length < 2 && !e.name.startsWith('.')) await walk(full, [...relDir, e.name])
      } else if (e.isFile() && VIDEO_EXTS.has(extname(e.name).toLowerCase())) {
        try {
          const info = await stat(full)
          out.push({ name: e.name, filePath: full, relDir, mtimeMs: info.mtimeMs })
        } catch {
          // File vanished between readdir and stat — skip it
        }
      }
    }
  }

  try {
    mkdirSync(root, { recursive: true })
  } catch {
    return []
  }
  await walk(root, [])
  out.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return out
}

export function registerFilesystemHandlers(): void {
  ipcMain.handle('fs:open-video', async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'm4v', 'avi'] }],
      properties: ['openFile', 'multiSelections'],
      defaultPath: defaultPath || undefined
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('fs:list-recordings', () => listRecordings())

  ipcMain.handle('fs:get-recordings-dir', () => {
    const dir = join(app.getPath('userData'), 'recordings')
    mkdirSync(dir, { recursive: true })
    return dir
  })

  // Hard limit: files above this are refused outright (see CLAUDE.md file size policy).
  const MAX_FILE_BYTES = 1024 * 1024 * 1024 // 1 GB

  ipcMain.handle('fs:file-size', async (_event, filePath: string) => {
    try {
      const info = await stat(filePath)
      return info.size
    } catch {
      return -1
    }
  })

  ipcMain.handle('fs:read-file-as-buffer', async (_event, filePath: string) => {
    const info = await stat(filePath)
    if (info.size > MAX_FILE_BYTES) {
      throw new Error(`file-too-large:${info.size}`)
    }
    // Async read so a large file never blocks the main process (and the UI).
    const buf = await readFile(filePath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle('fs:scan-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Folder to Scan',
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null

    const folderPath = result.filePaths[0]
    let entries: string[] = []
    try {
      entries = readdirSync(folderPath)
    } catch {
      return null
    }

    const files = entries
      .filter((name) => VIDEO_EXTS.has(extname(name).toLowerCase()))
      .map((name) => ({ name, filePath: join(folderPath, name) }))

    return { folderPath, files }
  })

  ipcMain.handle('fs:get-thumbnail', async (_event, filePath: string) => {
    try {
      const img = await nativeImage.createThumbnailFromPath(filePath, { width: 320, height: 180 })
      if (img.isEmpty()) return null
      return img.toDataURL()
    } catch {
      return null
    }
  })

  ipcMain.handle('fs:scan-directory', (_event, dirPath: string) => {
    let entries: string[] = []
    try {
      entries = readdirSync(dirPath)
    } catch {
      return null
    }

    const files = entries
      .filter((name) => VIDEO_EXTS.has(extname(name).toLowerCase()))
      .map((name) => ({ name, filePath: join(dirPath, name) }))

    return { folderPath: dirPath, files }
  })
}
