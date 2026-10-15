import { app, BrowserWindow, shell, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc'

// sas-media://  →  streams a local video file to <video> without copying it
// through IPC. Must be registered before app is ready. URL form:
//   sas-media:///C:/path/to/clip.mp4   (path is URI-encoded by the preload helper)
// Keep rendering and timers running when GSPro (or anything else) covers our
// windows. Without these, Windows reports the window as hidden, Chromium stops
// painting it (OBS Window Capture freezes on the last frame) and throttles
// timers (the trigger mic's 10 ms polling slows to once a second).
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')

/** window.open() name the renderer uses for the OBS stream window (see components/stream/streamWindow.tsx). */
const STREAM_WINDOW_NAME = 'sas-stream'

protocol.registerSchemesAsPrivileged([
  { scheme: 'sas-media', privileges: { stream: true, supportFetchAPI: true, bypassCSP: true, secure: true } }
])

function registerMediaProtocol(): void {
  protocol.handle('sas-media', async (request) => {
    try {
      // sas-media:///C%3A/dir/clip.mp4  →  C:/dir/clip.mp4
      const raw = request.url.replace(/^sas-media:\/\/\/?/, '')
      let filePath = decodeURIComponent(raw.split('?')[0])
      if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1)

      // Forward only the Range header so <video> can seek; nothing else.
      const range = request.headers.get('range')
      const res = await net.fetch(pathToFileURL(filePath).toString(), {
        headers: range ? { Range: range } : {}
      })
      if (!res.ok && res.status !== 206) {
        console.error('[sas-media] fetch failed', res.status, filePath)
      }
      return res
    } catch (err) {
      console.error('[sas-media] error serving', request.url, err)
      return new Response('Not found', { status: 404 })
    }
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') callback(true)
    else callback(false)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // The OBS stream window: a plain 1920x1080 window the renderer draws into
    if (frameName === STREAM_WINDOW_NAME) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1920,
          height: 1080,
          useContentSize: true,
          minWidth: 480,
          minHeight: 270,
          title: 'SaS Stream',
          backgroundColor: '#000000',
          autoHideMenuBar: true,
          webPreferences: { backgroundThrottling: false }
        }
      }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-create-window', (child) => {
    child.removeMenu()
  })

  // Closing the main window closes the stream window too
  mainWindow.on('closed', () => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.close()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  registerIpcHandlers(mainWindow)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.sendaswing.desktop')
  registerMediaProtocol()
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
