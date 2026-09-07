import { ipcMain, app, dialog, nativeImage } from 'electron'
import { mkdirSync, readdirSync } from 'fs'
import { readFile, stat } from 'fs/promises'
import { join, extname } from 'path'

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi'])

export function registerFilesystemHandlers(): void {
  ipcMain.handle('fs:open-video', async (_event, defaultPath?: string) => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'm4v', 'avi'] }],
      properties: ['openFile', 'multiSelections'],
      defaultPath: defaultPath || undefined
    })
    return result.canceled ? [] : result.filePaths
  })

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
