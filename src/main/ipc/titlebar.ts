import { ipcMain, type BrowserWindow } from 'electron'

export function registerTitlebarHandlers(win: BrowserWindow): void {
  ipcMain.on('titlebar:minimize', () => win.minimize())
  ipcMain.on('titlebar:maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('titlebar:close', () => win.close())
}
