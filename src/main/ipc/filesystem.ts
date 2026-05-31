import { ipcMain, app, dialog } from 'electron'
import { readFileSync, mkdirSync, readdirSync } from 'fs'
import { join, extname, basename } from 'path'

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

  ipcMain.handle('fs:read-file-as-buffer', (_event, filePath: string) => {
    const buf = readFileSync(filePath)
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
