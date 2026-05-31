import type { BrowserWindow } from 'electron'
import { registerRecordingHandlers } from './recording'
import { registerFilesystemHandlers } from './filesystem'
import { registerTitlebarHandlers } from './titlebar'
import { registerSettingsHandlers } from './settings'

export function registerIpcHandlers(win: BrowserWindow): void {
  registerRecordingHandlers()
  registerFilesystemHandlers()
  registerTitlebarHandlers(win)
  registerSettingsHandlers()
}
