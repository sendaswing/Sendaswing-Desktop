import { ipcMain, app } from 'electron'
import { createWriteStream, mkdirSync } from 'fs'
import { join } from 'path'
import type { WriteStream } from 'fs'

interface RecordingSession {
  stream: WriteStream
  filename: string
  cameraLabel: string
  startTime: number
  path: string
}

const sessions = new Map<string, RecordingSession>()

export function registerRecordingHandlers(): void {
  ipcMain.handle('recording:init', (_event, { filename, cameraLabel }: { filename: string; cameraLabel: string }) => {
    const dir = join(app.getPath('userData'), 'recordings')
    mkdirSync(dir, { recursive: true })

    const filePath = join(dir, filename)
    const stream = createWriteStream(filePath)
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    sessions.set(sessionId, {
      stream,
      filename,
      cameraLabel,
      startTime: Date.now(),
      path: filePath
    })

    return sessionId
  })

  ipcMain.handle('recording:chunk', (_event, { sessionId, chunk }: { sessionId: string; chunk: Uint8Array }) => {
    const session = sessions.get(sessionId)
    if (!session) return false
    session.stream.write(Buffer.from(chunk))
    return true
  })

  ipcMain.handle('recording:finalize', (_event, { sessionId }: { sessionId: string }) => {
    const session = sessions.get(sessionId)
    if (!session) return null

    return new Promise((resolve) => {
      session.stream.end(() => {
        sessions.delete(sessionId)
        const duration = (Date.now() - session.startTime) / 1000
        resolve({
          id: `clip-${Date.now()}`,
          name: session.filename,
          filePath: session.path,
          duration,
          fps: 30,
          frameCount: Math.round(duration * 30),
          thumbnailPath: null,
          recordedAt: new Date().toISOString(),
          cameraLabel: session.cameraLabel,
          tags: [],
          annotations: []
        })
      })
    })
  })
}
