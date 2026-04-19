import type { BrowserWindow } from 'electron'
import { registerRecordingHandlers } from './recording'
import { registerFilesystemHandlers } from './filesystem'
import { registerTitlebarHandlers } from './titlebar'

export function registerIpcHandlers(win: BrowserWindow): void {
  registerRecordingHandlers()
  registerFilesystemHandlers()
  registerTitlebarHandlers(win)
}
