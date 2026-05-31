import { ipcMain } from 'electron'
import { createWriteStream, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import type { WriteStream } from 'fs'
import { getRecordingsDir } from './settings'

interface RecordingSession {
  stream: WriteStream
  filename: string
  cameraLabel: string
  cameraAngle: string
  club: string
  startTime: number
  path: string
}

const sessions = new Map<string, RecordingSession>()

export function registerRecordingHandlers(): void {
  ipcMain.handle('recording:next-swing-number', () => {
    const dir = getRecordingsDir()
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const dateStr = `${mm}.${dd}.${now.getFullYear()}`

    let entries: string[] = []
    try {
      mkdirSync(dir, { recursive: true })
      entries = readdirSync(dir)
    } catch {
      return 1
    }

    // files named: MM.DD.YYYY.Angle.N.(mp4|webm)
    const prefix = dateStr.replace(/\./g, '\\.')
    const pattern = new RegExp(`^${prefix}\\.\\w+\\.(\\d+)\\.(mp4|webm)$`)
    let max = 0
    for (const name of entries) {
      const m = name.match(pattern)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return max + 1
  })

  ipcMain.handle('recording:init', (_event, { filename, cameraLabel, cameraAngle, club }: { filename: string; cameraLabel: string; cameraAngle: string; club: string }) => {
    const dir = getRecordingsDir()
    mkdirSync(dir, { recursive: true })

    const filePath = join(dir, filename)
    const stream = createWriteStream(filePath)
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    sessions.set(sessionId, {
      stream,
      filename,
      cameraLabel,
      cameraAngle: cameraAngle ?? '',
      club: club ?? '',
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
          cameraAngle: session.cameraAngle,
          club: session.club,
          tags: [],
          annotations: []
        })
      })
    })
  })
}
