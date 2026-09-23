import type { BrowserWindow } from 'electron'
import { registerRecordingHandlers } from './recording'
import { registerFilesystemHandlers } from './filesystem'
import { registerTitlebarHandlers } from './titlebar'
import { registerSettingsHandlers } from './settings'
import { registerConvertHandlers } from './convert'
import { registerBufferedCaptureHandlers } from './bufferedCapture'

export function registerIpcHandlers(win: BrowserWindow): void {
  registerRecordingHandlers()
  registerFilesystemHandlers()
  registerTitlebarHandlers(win)
  registerSettingsHandlers()
  registerConvertHandlers(win)
  registerBufferedCaptureHandlers()
}
