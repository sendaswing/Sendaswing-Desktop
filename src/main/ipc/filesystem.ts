import { ipcMain, app, dialog } from 'electron'
import { readFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export function registerFilesystemHandlers(): void {
  ipcMain.handle('fs:open-video', async (_event) => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'm4v', 'avi'] }],
      properties: ['openFile', 'multiSelections']
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
}
