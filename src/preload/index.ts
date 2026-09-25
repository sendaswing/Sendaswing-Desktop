import { contextBridge, ipcRenderer, webUtils } from 'electron'

const electronAPI = {
  recording: {
    init: (opts: { filename: string; cameraLabel: string; cameraAngle: string; club: string }) =>
      ipcRenderer.invoke('recording:init', opts),
    chunk: (sessionId: string, chunk: Uint8Array) =>
      ipcRenderer.invoke('recording:chunk', { sessionId, chunk }),
    finalize: (sessionId: string) =>
      ipcRenderer.invoke('recording:finalize', { sessionId }),
    nextSwingNumber: (): Promise<number> =>
      ipcRenderer.invoke('recording:next-swing-number')
  },
  fs: {
    openVideo: (defaultPath?: string): Promise<string[]> => ipcRenderer.invoke('fs:open-video', defaultPath),
    getRecordingsDir: (): Promise<string> => ipcRenderer.invoke('fs:get-recordings-dir'),
    readFileAsBuffer: (filePath: string): Promise<ArrayBuffer> =>
      ipcRenderer.invoke('fs:read-file-as-buffer', filePath),
    scanFolder: (): Promise<{ folderPath: string; files: Array<{ name: string; filePath: string }> } | null> =>
      ipcRenderer.invoke('fs:scan-folder'),
    scanDirectory: (dirPath: string): Promise<{ folderPath: string; files: Array<{ name: string; filePath: string }> } | null> =>
      ipcRenderer.invoke('fs:scan-directory', dirPath),
    getThumbnail: (filePath: string): Promise<string | null> =>
      ipcRenderer.invoke('fs:get-thumbnail', filePath),
    /** Size in bytes, or -1 if the file can't be read. */
    fileSize: (filePath: string): Promise<number> => ipcRenderer.invoke('fs:file-size', filePath),
    /** Absolute path of a File dropped from the OS (File.path was removed from Electron). */
    getPathForFile: (file: File): string => {
      try { return webUtils.getPathForFile(file) } catch { return '' }
    },
    /** URL that streams a local video into a <video> element (see sas-media protocol in main). */
    mediaUrl: (filePath: string): string =>
      'sas-media:///' + encodeURIComponent(filePath.replace(/\\/g, '/')).replace(/%2F/g, '/')
  },
  convert: {
    probe: (filePath: string): Promise<{
      width: number; height: number; fps: number; duration: number; codec: string; sizeBytes: number; rotation: number
    }> => ipcRenderer.invoke('convert:probe', filePath),
    start: (req: {
      srcPath: string; startSec: number; endSec: number
      resolution: '720' | '1080' | 'original'; quality: 'fast' | 'balanced' | 'best'
      cameraAngle: string; club: string
    }): Promise<{ ok: true; clip: any } | { ok: false; error: string }> =>
      ipcRenderer.invoke('convert:start', req),
    cancel: (): Promise<boolean> => ipcRenderer.invoke('convert:cancel'),
    /** Subscribe to progress (0..1). Returns an unsubscribe function. */
    onProgress: (cb: (p: { pct: number; fps?: number }) => void): (() => void) => {
      const handler = (_e: unknown, p: { pct: number; fps?: number }) => cb(p)
      ipcRenderer.on('convert:progress', handler)
      return () => { ipcRenderer.removeListener('convert:progress', handler) }
    }
  },
  capture: {
    /** Trim a buffered segment around the trigger and save it in studio format. */
    saveBuffered: (req: {
      data: Uint8Array; ext: 'mp4' | 'webm' | 'mkv'; startSec: number; durationSec: number; fps: number
      flipH?: boolean; flipV?: boolean; swingNumber: number; cameraAngle: string; cameraLabel: string; club: string
    }): Promise<{ ok: true; clip: any } | { ok: false; error: string }> =>
      ipcRenderer.invoke('capture:save-buffered', req)
  },
  titlebar: {
    minimize: () => ipcRenderer.send('titlebar:minimize'),
    maximize: () => ipcRenderer.send('titlebar:maximize'),
    close: () => ipcRenderer.send('titlebar:close')
  },
  settings: {
    getRecordingsDir: (): Promise<string> => ipcRenderer.invoke('settings:get-recordings-dir'),
    setRecordingsDir: (): Promise<string | null> => ipcRenderer.invoke('settings:set-recordings-dir'),
    openRecordingsDir: (): Promise<void> => ipcRenderer.invoke('settings:open-recordings-dir'),
    getLibraryDir: (): Promise<string> => ipcRenderer.invoke('settings:get-library-dir'),
    setLibraryDir: (): Promise<string | null> => ipcRenderer.invoke('settings:set-library-dir'),
    openLibraryDir: (): Promise<void> => ipcRenderer.invoke('settings:open-library-dir')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
