import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  recording: {
    init: (opts: { filename: string; cameraLabel: string }) =>
      ipcRenderer.invoke('recording:init', opts),
    chunk: (sessionId: string, chunk: Uint8Array) =>
      ipcRenderer.invoke('recording:chunk', { sessionId, chunk }),
    finalize: (sessionId: string) =>
      ipcRenderer.invoke('recording:finalize', { sessionId })
  },
  fs: {
    openVideo: (): Promise<string[]> => ipcRenderer.invoke('fs:open-video'),
    getRecordingsDir: (): Promise<string> => ipcRenderer.invoke('fs:get-recordings-dir'),
    readFileAsBuffer: (filePath: string): Promise<ArrayBuffer> =>
      ipcRenderer.invoke('fs:read-file-as-buffer', filePath)
  },
  titlebar: {
    minimize: () => ipcRenderer.send('titlebar:minimize'),
    maximize: () => ipcRenderer.send('titlebar:maximize'),
    close: () => ipcRenderer.send('titlebar:close')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
