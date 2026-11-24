# Sendaswing Desktop — Roadmap

> **What this file is:** Brendan's planning doc: where the app is headed, what's next, open
> decisions, the idea parking lot, and a running change log. It's built to travel: paste or
> attach it to any new chat or agent and they're up to speed in a couple of minutes.
>
> **What it is not:** the technical guide. Architecture, code rules and gotchas live in
> [`CLAUDE.md`](CLAUDE.md). This file says *what* and *why*; CLAUDE.md says *how*.
>
> **Last updated:** 2026-11-24 (pm) · **GitHub `main`:** `cfb2fc5` · **Version:** 1.0.0 (pre-release, not tagged) · **License:** MIT
>
> **🎯 Current goal: public BETA installer by Mon Dec 14, 2026.** Solidify what exists, tighten
> the Library (connect the public Google Drive "Swing Database"), and add a **Send a Swing tab**
> that uploads up to 2 swings + lesson notes to Google Drive. Payments, promotions and giveaways
> are on hold.

---

## 1. Agent quickstart (read this first)

**The app:** a Windows desktop golf swing video studio (Electron + React + TypeScript). It's
Brendan's own alternative to V1 Pro Studio / GolfTec-style software, built for his **Send a
Swing** coaching business (sendaswing.com). Core screens: **Home**, **Capture** (multi-camera,
Standard + Buffered/trigger-mic modes), **Import** (trim + convert to an all-intra "studio
format"), **Analyze** (frame-accurate scrubbing + drawing), **Compare**, **Library**,
**Settings**, and a **Stream window** for OBS.

**Who Brendan is:** a PGA instructor with strong Windows/hardware/networking skills who does
**not** write code. Explain in plain language, give exact commands, and don't expect him to
hand-edit code.

**The #1 rule:** scrubbing quality comes before everything else.

**The beta rule:** until Dec 14, only work on items in section 3. Anything else goes in the
parking lot (section 7).

**Where the code lives**

| Place | Path | Notes |
|---|---|---|
| GitHub | github.com/sendaswing/Sendaswing-Desktop | Public repo, branch `main` |
| bbgolf (laptop) | `C:\SaS-Desktop\Sendaswing-Desktop` | Main dev machine |
| BEEF (garage PC) | local clone, synced via GitHub | Has the range cameras, trigger mic, GSPro and OBS. Real-world testing happens here |

**Environment:** Node **20** via NVM (Node 24 breaks it) · `npm install --legacy-peer-deps` · `npm run dev`

**How work flows**
1. Pull in GitHub Desktop before starting, on whichever computer.
2. Claude edits files in the connected folder, or pushes a `claude/<feature>` branch and opens a PR.
3. Brendan runs `npm run dev` in VS Code and tests.
4. Brendan commits/pushes (or merges the PR) with GitHub Desktop.
5. One feature or bug per chat. At the end of each session, update the **Change log** below.

**Things that have bitten us before**
- Windows files are CRLF. Strip `\r` before diffing against a Linux clone, or every file looks changed.
- GitHub Desktop once **stashed** a whole feature during a pull (the Stream window, Oct 2026). If local and GitHub "should" differ but don't, check *Stashed Changes*.
- The cloud sandbox usually can't reach npm, so it can't run `tsc` or `npm run build`. Say so, and have Brendan run the typechecks.
- Clone with `GIT_LFS_SKIP_SMUDGE=1`.

---

## 2. Where things stand (Nov 24 2026)

- ✅ **Home tab (design D)** tested and committed (Nov 24).
- ✅ **Cameras** confirmed working after the Oct 29 crash fix (PRs #20, #21).
- 🟡 Oct 20 import/folders/player plan: agreed, not built. **D1 decided Nov 24: dashes (`2026-12-01`)**, so it's unblocked.
- ✅ Working in real use: buffered capture + trigger mic, `.mov` import/convert, Stream window.
- ✅ Installer config is mostly ready: `electron-builder.yml` builds an NSIS installer and already unpacks ffmpeg/ffprobe. Missing: `build/icon.ico`, `author`, a test build.

---

## 3. NOW: Beta 1 — target Mon Dec 14

**Version:** `1.0.0-beta.1` · **Who gets it (D9):** Brendan's home simulator (BEEF) + bbgolf laptop → the **2 simulator bays at Granite Links** → later the **semi-private commercial location** (less used, can be set up)

### Week 1 · Nov 24 – 30 (Thanksgiving week: keep it light)
- [x] **Test + commit the Home tab** on bbgolf (`npm run typecheck:web`, `npm run typecheck:node`, `npm run dev`), push, pull on BEEF
- [x] **Garage test on BEEF:** Camera Driver Mode (cameras open, Compatibility mode holds) + buffered capture re-check (~60 fps preview, pre-roll timing)
- [x] Decide D1 (dashes), D2 (MIT), D8 (public Drive link), D10 (Send a Swing tab → Drive)
- [x] Decide D9: home sim first, then Granite Links' 2 sim bays, then the semi-private location
- [ ] Brendan sends the field list (or a screenshot) of his sendaswing.com lesson form, for the Send a Swing tab notes
- [ ] Brendan creates a free Google Cloud project + **API key** (Drive API, read-only) for the Pro Library — Claude walks through it
- [x] Submissions folder: Drive [`SaS-Desktop`](https://drive.google.com/drive/folders/1sjiCKkA-Mb2VdkQUU-wT2z1Zr5S0I_Ek) (private, owned by brendan@bbgolf.academy)
- [x] Add MIT `LICENSE` file + `license` field in package.json

### Week 2 · Dec 1 – 7 — Solidify
**Import (simplified for beta)**
- [ ] **Quick Import** button: whole clip, downscaled to 1080 if larger, default quality, opens straight into Analyze
- [ ] **Trim & Import** button: today's trim screen
- [ ] Multi-file: Quick Import converts them all in a row. *(Trim & Import stepping through files "2 of 5" → after beta)*
- [ ] Imports named `import.01.mp4`, `import.02.mp4` … in that day's folder
- [ ] Make Import obvious: bigger button + "Drop a video here or click Import" hint
- [ ] Home's Import tile uses Quick Import

**Session folders + player**
- [ ] `Recordings/2026-12-01/<Player>/FO.1.mp4` layout (captures with no player go straight in the date folder). Old files stay put and show under "Older"
- [ ] **Player** dropdown on Capture (recent names + "None")
- [ ] Analyze clip panel: today expanded, past days collapsed, newest first

**Fixes that matter for beta testers**
- [x] Flipped Standard-mode recordings drop frames at 120 fps (`FlipProxy`): flip in ffmpeg like Buffered mode *(done Nov 24, needs a garage test with a flipped camera)*
- [x] Remove the leftover 5 s `setTimeout` in `ChunkDemuxer.load`
- [x] `useKeyboardShortcuts` re-registers on every render
- [ ] Library/ClipBrowser thumbnails via `sas-media://` instead of buffer copies (speed with big folders)
- [ ] Confirm an iPhone HEVC `.mov` imports fine through ffmpeg. If so, **drop** the HEVC warning item
- [ ] Housekeeping: delete stray `Claude outputs/index.ts`; fix the stale OneDrive path in CLAUDE.md

### Week 3 · Dec 8 – 13 — Library + lesson sharing + packaging
**Tighten up the Library**
- [ ] Library folders list (more than one folder): e.g. **My Swings**, **Tour / Pro Swings**, **Lessons**
- [ ] **Pro Library** from the public Drive folder [Swing Database](https://drive.google.com/drive/folders/1cfkXZyQq5o1KNRkCHqPYoGVVZrlWBQHN) (anyone-with-link, view): the app lists its subfolders/videos with the API key, downloads a clip only when opened, and caches it locally so it opens instantly next time. Brendan adds videos in Drive as usual; every install sees them
- [ ] On Brendan's own PCs, a local folder (e.g. `G:\My Drive\Swing Database`) can still be added as a normal Library folder
- [ ] Search by name, angle (FO/DL) and club; sort newest/oldest
- [ ] Open from Library → Analyze, or send two clips to Compare
- [ ] Empty states that explain what to do ("Pick a folder" / "Connect the Pro Library")

**Send a Swing tab (beta online lessons)** — new sidebar tab
- [ ] Pick a session (date folder), then select **up to 2 swings** from it (thumbnails; typically one FO + one DL)
- [ ] **Lesson notes** form modeled on the sendaswing.com lesson form *(fields TBD — waiting on Brendan's list)*. Name + email remembered between sends
- [ ] **Send** uploads straight to Brendan's Google Drive: a new folder per submission, e.g. `SaS-Desktop/2026-12-01 John Smith/` containing `FO.mp4`, `DL.mp4` and `notes.txt` (plus a Google Doc copy of the notes)
- [ ] How the upload works: a small **Google Apps Script** web app running on Brendan's account creates the folder and hands the app a one-time upload link, so students **don't need a Google account** and no Drive password lives in the app. Handles large files (resumable upload, progress bar, retry)
- [ ] Brendan gets an email for each new submission (from the Apps Script)
- [ ] Student sees a confirmation ("Sent! Brendan will reply within …") and a "Sent" badge on those swings
- [ ] Size guard: if a clip is huge, convert it to a lighter 1080 MP4 before uploading (scrubbing copies stay untouched)
- [ ] Home's **Send to a coach** tile opens this tab
- *No payments in beta — added later with the website overhaul*

**Package it**
- [ ] `build/icon.ico` (Brendan supplies 256×256), `author` in package.json, move renderer-only deps to devDependencies
- [ ] About box / title bar shows "Beta 1" and the version
- [ ] "Send logs" or "Open log folder" in Settings (electron-log already writes them) so testers can report problems
- [ ] `npm run dist` → install on the *other* PC → check Home, Capture, Import, scrubbing, Library, Export Lesson in the installed app
- [ ] Install on the Granite Links sim bay PCs (check: Windows version, cameras attached, admin rights to install, how they reach the internet)
- [ ] Short tester note: install steps (incl. the Windows SmartScreen "More info → Run anyway" step, since the installer isn't code-signed), what to test, how to send feedback

### Dec 14 · Ship Beta 1
- [ ] Tag `v1.0.0-beta.1` on GitHub and attach the installer to a GitHub Release
- [ ] Install at Granite Links bays; schedule the semi-private location after the first round of fixes
- [ ] Start a "Beta feedback" list in section 7

### ✂️ Cut from beta (moved later — chop more here if time runs short)
- Trim & Import multi-file stepping ("2 of 5")
- Setting for which import runs on drag-and-drop (Quick is the default)
- Stream window OBS tuning beyond "it works" (Brendan uses it; testers likely won't)
- Coach/Student mode split, sendaswing.com in-app browser, payments, launch offer and giveaways (→ v1.1)
- Coach-side Export Lesson (annotated video + voice-over back to the student) (→ parking lot)
- Students tab (→ v1.2)

**If week 3 slips, cut in this order:** Google Doc copy of notes → multi-folder Library (keep one folder + Pro Library) → Send logs button → "Sent" badges. **Never cut:** Home commit, camera test, Quick Import, Send a Swing upload, installer test.

---

## 4. Next: v1.0 final (Jan 2027, after beta feedback)

- [ ] Fix what beta testers report
- [ ] Trim & Import multi-file stepping; drag-and-drop import setting
- [ ] Stream window in OBS with GSPro fullscreen: smoothness, FO/DL replay sync, CPU load
- [ ] Tag **v1.0**

## 5. Then: v1.1 (Coach / Student modes + launch offer)

- [ ] First-launch welcome screen: **"I'm a coach / I'm a student"** (changeable in Settings)
- [ ] **Student mode:** Capture, Import, Analyze, SendaSwing tab. No Students tab
- [ ] **Coach mode:** everything, free and open source for any instructor
- [ ] **Send a Swing tab, phase 2:** payment before upload (ties into the website overhaul); optionally sendaswing.com account login and an in-app view of the site, locked to it
- [ ] Student onboarding: sendaswing.com registration → streamlined purchase (ties into the website overhaul)
- [ ] *Maybe:* "Send to SendaSwing" button on a clip
- [ ] **Launch offer (on hold):** first **N** players get a free swing analysis, live "32 of 50 claimed" counter on Home, deadline, follow-up discount code

## 6. Later: v1.2 (Students tab) and beyond

- [ ] Students tab: create/edit/archive students; Player dropdown pulls from it; renaming renames folders
- [ ] "All swings" per student, reference swing, first-vs-latest comparison
- [ ] Profile fields: basics + handedness · handicap, home course · usual miss, goals · equipment · GC3 numbers · lesson notes + drills
- [ ] Student "looking for a coach" opt-in on sendaswing.com; **coaches pay for access to that list**; app stays free
- [ ] Coach accounts via sendaswing.com login; sync with the client portal

---

## 7. Idea parking lot (not scheduled)

| Idea | Notes | Source |
|---|---|---|
| OpenFlight shot data on clips | Listen for OpenFlight's Socket.IO `shot` events, stamp clips with ball/club data, overlay while scrubbing. Network-only to avoid AGPL | Oct 2026 |
| Data-driven shot tracer | Draw a tracer from real launch/carry data (OpenTrace is MIT) | Oct 2026 |
| GC3 numbers on clips | Manual entry first, sync later | v1.2 ideas |
| Android capture app | Bare React Native + vision-camera. Scaffolded, **paused until Desktop v1 is stable** | Jul 2026 |
| Faster shutter in the garage | After more lighting above the FO camera, step 1/128 → 1/250 → 1/500 → 1/1000 | Sep 2026 |
| FO + DL pair import | Select 2 files → FO + DL of one swing → open side by side | Oct 20 |
| SendaSwing tab start page | Normal landing page vs a special `/app` page; editable allowed-sites list. Mockup E | Nov 10 |
| Auto-update | electron-updater from GitHub Releases, so testers don't reinstall by hand | Nov 24 |
| Coach Export Lesson | Analyze → render clip(s) with drawings + optional voice-over to `.mp4` → share back to the student (Drive link or sendaswing.com) | Nov 24 (was the first guess at "lesson sharing") |
| Code signing | Removes the SmartScreen warning. Costs money per year; worth it before a wide public release | Nov 24 |

**Beta feedback** *(add tester reports here after Dec 14)*

---

## 8. Open decisions

| # | Decision | Options | Leaning / notes |
|---|---|---|---|
| D11 | Lesson notes fields | Copy the sendaswing.com lesson form | Waiting on Brendan's field list |
| D12 | Submission subfolder name inside Drive `SaS-Desktop` | `2026-12-01 John Smith` vs `John Smith/2026-12-01` | `2026-12-01 John Smith` suggested (newest-first sorting in Drive) |
| D3 | Launch offer size and deadline | 25 / 50 / 100 + end date | On hold until v1.1 |
| D4 | Launch offer timing | With v1 or v1.1 | On hold — v1.1 |
| D5 | Coach mode pricing later | Student-list access (preferred) vs 3-month trial | Prefers student-list access |
| D7 | SendaSwing tab start page | Existing landing page vs `/app` page | v1.1. `/app` suggested |

---

**Decided**

| # | Decision | Answer | Date |
|---|---|---|---|
| D1 | Date folder format | Dashes: `2026-12-01` | Nov 24 |
| D2 | Open-source license | **MIT** | Nov 24 |
| D8 | Library + Drive pro swings | In-app Pro Library reading the public "Swing Database" folder link (API key); local folders still allowed | Nov 24 |
| D9 | Who's in Beta 1 | Home sim → Granite Links' 2 sim bays → semi-private commercial location | Nov 24 |
| D10 | Beta online lessons | Send a Swing tab: up to 2 swings per session + lesson notes → new folder in Brendan's Google Drive. Payments later | Nov 24 |

---

## 9. Change log (newest first)

*One line per meaningful change. Agents: add an entry at the end of every session.*

| Date | Change | Commit / PR |
|---|---|---|
| 2026-11-24 | Beta fixes: Standard-mode flips now done by ffmpeg on save (full frame rate, studio format; FlipProxy no longer used); ChunkDemuxer 5 s timer removed; useKeyboardShortcuts registers once. Home tab + camera test confirmed | not committed yet |
| 2026-11-24 | Beta sites set (home sim, Granite Links 2 bays, semi-private location); submissions go to Drive `SaS-Desktop` folder | — |
| 2026-11-24 | Decisions: dashes for date folders, MIT license (LICENSE file added), Pro Library from public Drive folder, Send a Swing tab uploads 2 swings + notes to Drive | — |
| 2026-11-24 | Re-planned for a public **Beta 1 by Dec 14**: 3-week plan, cut list, Library + lesson sharing added, promotions put on hold. New decisions D8–D10 | — |
| 2026-11-10 | Home tab (design D chosen from 5 mockups, replacing a first build of B): four big tiles, recent swings, Send a Swing card; Start Screen setting; `fs:list-recordings` IPC | not committed yet |
| 2026-11-10 | Created ROADMAP.md. Confirmed bbgolf and GitHub match at `cfb2fc5` | — |
| 2026-10-29 | Camera Driver Mode: auto-switch to DirectShow after a camera process crash, plus a Standard/Compatibility toggle in Settings | `24b88a3`, PR #21 |
| 2026-10-29 | Camera crash loop fix: guard auto-restore, close permission probe, log crashes | `dc589f7`, PR #20 |
| 2026-10-20 | Planning only: v1 import/folders/player plan, Coach/Student split, v1.1/v1.2/Later roadmap, launch offer | (no code) |
| 2026-10-15 | Recovered the stashed Stream window feature and merged it with the Sep 25 camera work | `09bbdc9` |
| 2026-09-25 | Camera settings saved per camera; buffered capture rewritten (one WebCodecs encoder per camera) | `d1703ea`, `1cb4f04` |
| 2026-09-23 | Hotkeys: Tab toggles Live/Replay, S saves a swing | `d3b5e55` |
| 2026-09-07 | Health check: frame cache rewrite, WebCodecs decoder fix, Import screen, CLAUDE.md added | `73cc0e4`, `90c7cae` |
| 2026-08-31 | Live camera flip H/V, flip baked into recordings, analysis flip button | PR #18, PR #19 |
| 2026-07-25 | Annotation defaults, pan/zoom, right-panel clear | PR #17 |
| 2026-06-06–07 | Library tab + search, recording timers, per-camera settings, faster thumbnails | PRs #13–#16 |
| 2026-05-30–31 | Scrubbing performance, dual-panel analysis, naming, swing tags, drag-and-drop | PRs #2–#12 |
| 2026-04-18 | Initial app: homebrew V1 Pro Studio–style clone | PR #1 |

---

## 10. Chat index (SaS-Desktop project)

| Date | Chat | Outcome |
|---|---|---|
| 2026-11-24 | Beta re-plan (this chat) | Rewrote this file around a Dec 14 beta; decided D1, D2, D8, D10 |
| 2026-11-10 | [Home page for recorded files](https://claude.ai/chat/a9f28826-9b2b-4890-aac5-6192c35d4067) | Five mockups; built B, then switched to D. Awaiting Brendan's test |
| 2026-11-10 | [Roadmap.md for development planning](https://claude.ai/chat/aa9f2a11-2a29-4dd2-8694-0062a5c32a95) | Created this file |
| 2026-10-29 | [Electron camera crash on live feed](https://claude.ai/chat/97c5db7b-9c69-4522-a1f6-07feca187220) | PRs #20 and #21. Awaiting garage test |
| 2026-10-20 | [To-do list before installer](https://claude.ai/chat/786c52a4-3d11-4e47-bc48-fc9fa391dee9) | Built the v1 / v1.1 / v1.2 / Later plan |
| 2026-10-15 | [OpenFlight background check](https://claude.ai/chat/1efc6f16-080d-49dd-a3e5-c9953399d248) | Integration ideas in the parking lot |
| 2026-10-15 | [SAS-desktop GitHub sync](https://claude.ai/chat/26b0e8d0-7c20-4601-8aee-341c9075c86c) | Restored the stashed Stream window, pushed `09bbdc9` |

---

## How to keep this file useful

- **New idea?** Add it to the parking lot (section 7) with a source and date. During the beta push, that's where it stays.
- **Decided something?** Update section 8, put the item in the right section, and add a change-log line.
- **Finished something?** Tick the box and add a change-log line with the commit or PR.
- **Technical rule or gotcha?** It goes in CLAUDE.md, not here.
- Keep it short. If a section grows past a screen, summarize the old parts.
