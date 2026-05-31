import { contextBridge, ipcRenderer } from 'electron'

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
      ipcRenderer.invoke('fs:scan-directory', dirPath)
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
