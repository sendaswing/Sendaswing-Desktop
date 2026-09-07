# Sendaswing Desktop — project guide for Claude

Read this first in every session. It is the shared memory for this project across
chats and across Brendan's two computers.

## What this is

Sendaswing Desktop is a golf swing video analysis studio for Windows (Mac/Linux
builds are configured but not the priority). It is Brendan's own alternative to
V1 Pro Studio / GolfTec-style analysis software, built for his Send a Swing
coaching business. Brendan is a PGA instructor with strong Windows/hardware
experience but does not write code himself — explain things in plain language,
give exact commands to run, and never assume he will hand-edit code.

Core workflows the app supports:

- **Capture** — live webcam preview (multi-camera grid), record swings to disk,
  tagged by camera angle (FO = face-on, DL = down-the-line) and club.
- **Import** — bring in any client video (phone, camera, broadcast), trim it
  with In/Out points, and convert it to the "studio format": H.264 MP4 where
  EVERY frame is a keyframe (all-intra), constant frame rate at the source's
  native rate, capped at 720p/1080p/original, no audio. This is what makes
  scrubbing instant — raw phone/broadcast files have keyframes seconds apart
  and can never scrub cleanly. Runs bundled ffmpeg/ffprobe in the main process.
- **Analyze** — frame-accurate scrubbing with a WebCodecs-based decoder,
  play/pause/speed, horizontal flip, and drawing tools (lines, etc.) over the
  video on a canvas overlay.
- **Compare** — two clips side by side with sync controls.
- **Library** — browse a chosen folder of existing swing videos with thumbnails.
- **Settings** — recordings folder and library folder, stored in
  `settings.json` under Electron's userData path.

## Tech stack

- Electron 41 + electron-vite 5 + Vite 5, TypeScript 5, React 18
- Tailwind CSS 3 (dark theme, `bg-surface-*` palette in `globals.css`)
- State: Zustand + immer (`src/renderer/src/store/*Store.ts`)
- UI primitives: Radix (dropdown, slider, tooltip), lucide-react icons
- Video: `mp4box` for demuxing, browser WebCodecs `VideoDecoder` for frames,
  MediaRecorder for capture. COOP/COEP headers are set in the Vite dev server so
  these APIs are available.
- Packaging: electron-builder 26 (`electron-builder.yml`), NSIS installer on
  Windows, output to `dist/`
- Logging: electron-log
- Video conversion: `ffmpeg-static` + `ffprobe-static` (spawned from
  `src/main/ipc/convert.ts`; unpacked from asar via `asarUnpack` in
  `electron-builder.yml`). Local files stream into `<video>` through the custom
  `sas-media://` protocol registered in `src/main/index.ts` (no IPC copy).

## Environment setup (both computers)

Node **20** via NVM. Node 24 is NOT compatible with this project's toolchain —
that was a real, already-solved problem; do not "upgrade" it.

```
nvm use 20
npm install --legacy-peer-deps
npm run dev
```

`--legacy-peer-deps` is required for install to succeed. Do not remove it.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with hot reload (main + preload + renderer) |
| `npm run build` | Compile to `out/` (no installer) |
| `npm run dist` | Build + produce the Windows installer in `dist/` |
| `npm run typecheck:node` | Type-check main/preload code |
| `npm run typecheck:web` | Type-check renderer (React) code |
| `npm run lint` | ESLint |

Before saying a change is done, run both typecheck scripts. If the change touches
the UI, run `npm run dev` and confirm the window opens without console errors.

## Project layout

```
src/
  main/               Electron main process (Node side)
    index.ts          Window creation (frameless, custom title bar), permissions
    ipc/              One file per IPC domain: recording, filesystem, settings, titlebar, convert
  preload/index.ts    contextBridge → exposes window.electronAPI to the renderer
  renderer/           React app (browser side, no Node access)
    src/
      components/     capture/ import/ analysis/ comparison/ library/ layout/ settings/
      hooks/          useRecorder, useScrubber, useDrawing, useCameras, useVideoElement…
      lib/
        scrubber/     ScrubberEngine, FrameDecoder, FrameCache, ChunkDemuxer, VideoFrameExtractor
        recording/    RecordingSession, FlipProxy
        drawing/      tools, serializer
      store/          Zustand stores (analysis, camera, clip, comparison, recording, settings)
      types/          clip, camera, drawing, scrubber
electron-builder.yml  Installer config (appId com.sendaswing.desktop)
electron.vite.config.ts  Path aliases: @renderer @lib @store @hooks @components
```

## Architecture rules

- **Main ↔ renderer only through IPC.** `contextIsolation` is on and
  `nodeIntegration` is off. Anything that touches the filesystem, dialogs, or
  the OS lives in `src/main/ipc/`, is exposed in `src/preload/index.ts`, and is
  called from the renderer as `window.electronAPI.<domain>.<fn>()`. Adding a
  new native capability means touching all three places.
- **Recording** streams MediaRecorder chunks over IPC (`recording:init` →
  `recording:chunk` → `recording:finalize`) into a write stream. Files are
  named `MM.DD.YYYY.<Angle>.<N>.<mp4|webm>` and the swing number N auto-
  increments per day (`recording:next-swing-number`).
- **Scrubbing** is frame-based, not time-based: `ScrubberEngine` demuxes the
  whole file, decodes on demand into a `FrameCache` (180 frames), and draws to a
  canvas. WebM files without a usable decoder fall back to
  `VideoFrameExtractor`. Only one decode/seek is in flight at a time — keep it
  that way.
- **Clip** is the central type (`types/clip.ts`): id, filePath, fps, frameCount,
  cameraAngle (`FO`/`DL`/`Other`), club, tags, annotations.
- Path aliases (`@lib`, `@store`, …) are for the renderer only.

## Working conventions

- Small, focused changes. One feature or bug per chat.
- Keep the existing file organization; put new code where its neighbors are.
- Don't add dependencies without saying why; check `--legacy-peer-deps`
  install still works after adding one.
- `node_modules/`, `out/`, `dist/` are gitignored and per-machine. If the app
  behaves differently on the two computers, the first suspect is a stale
  `node_modules` — re-run `npm install --legacy-peer-deps`.
- Commit and push at the end of every session; pull before starting on the
  other computer. The repo lives at github.com/sendaswing/Sendaswing-Desktop.

## Known gotchas

- Node 24 breaks the build — use Node 20 via `nvm use 20`.
- `npm install` fails without `--legacy-peer-deps`.
- VS Code may warn "Git not found" if only GitHub Desktop is installed — that is
  a VS Code integration warning, not a project error.
- The project folder on the second computer is inside OneDrive
  (`OneDrive\Documents\GitHub\Sendaswing-Desktop`). OneDrive syncing
  `node_modules` can be slow; if installs hang, pause OneDrive sync or move the
  folder outside OneDrive.

## Roadmap / open ideas

(Add items here as decisions are made so future chats don't re-propose them.)

### Decisions (Sep 2026)

- **File size policy:** hard cap of 1 GB per video; anything over ~250 MB is
  discouraged. If a file is too big, Brendan trims it in a separate program
  before opening it in the app. The app should warn/refuse on oversized files
  rather than try to handle them.
- **Frame cache:** cap by memory budget (~1.5 GB), not by frame count, and keep
  a rolling window around the playhead instead of preloading whole clips.
  Large/high-quality clips (e.g. the "tour" folder) were stalling and lagging
  on the first frame — this is the primary fix.
- **File loading:** replace synchronous whole-file reads over IPC with async
  reads and remove the extra buffer copies. (Done.)
- **Scrubbing is the #1 priority — over everything else.** The engine
  (`ScrubberEngine`) keeps a memory-budgeted frame cache with a rolling preload
  window, decodes whole keyframe groups on seek, and pauses preload while the
  user drags. But for raw phone/broadcast files that is fundamentally limited
  by keyframe spacing. The real fix is the **Import → convert to all-intra**
  workflow; converted clips scrub instantly anywhere. Don't try to solve
  scrubbing of raw files with more cache tuning.
- **Health check finding (Sep 2026):** `extractAvcC` was stubbed, so WebCodecs
  decoding had ALWAYS failed and every MP4 silently fell back to the slow
  HTML5 extractor path. Fixed — MP4s now decode through WebCodecs.
- **App icon:** Brendan is supplying one. Goes in `build/icon.ico` (256×256).
- **Health check (Sep 2026) order of work:** frame cache → drag-drop + decoder
  fixes → async file loading → packaging → pre-v1 cleanup list below.

### Pre-v1 release checklist

- [x] Frame cache memory budget + rolling window (see above)
- [x] Oversized-file guard (1 GB hard cap, warn above 250 MB)
- [x] Native Explorer drag-and-drop uses `webUtils.getPathForFile` in preload
- [x] `extractAvcC` in `ChunkDemuxer.ts` — implemented (serializes avcC/hvcC box)
- [x] Async file reads (`fs.promises.readFile`) in `fs:read-file-as-buffer`
- [ ] Import feature (Sep 2026): test on iPhone HEVC .mov, portrait video,
      240 fps slo-mo, and a VFR screen recording; verify preview seeking works
      through `sas-media://` (Range requests) in the packaged build
- [x] Opening/dropping a raw file in Analyze goes through the Import screen
- [ ] Introductory / welcome screen on first launch (logo, maybe a quick tour
      of Capture / Import / Analyze). Idea floated Sep 2026 — decide at
      pre-release time.
- [ ] Library/ClipBrowser thumbnails: switch to `sas-media://` URLs instead of
      `readFileAsBuffer` copies
- [ ] Packaging: `build/icon.ico`, `author` in package.json, move renderer-only
      deps (react, radix, lucide, mp4box, zustand, immer, tailwind-merge, clsx)
      to devDependencies so the installer doesn't ship them twice
- [ ] `FlipProxy` redraws on rAF (60 fps) — flipped recordings lose frames from
      120 fps cameras; drive it from the track's frame rate instead
- [x] `VideoFrameExtractor` allocates a new OffscreenCanvas per frame — reuse one
- [ ] `useKeyboardShortcuts` re-registers its listener on every render
- [ ] iPhone HEVC `.mov` files likely fail to decode on Windows without the HEVC
      extension — show a clear message instead of hanging
- [ ] Remove the leftover 5 s `setTimeout` in `ChunkDemuxer.load` that fires
      after resolve
