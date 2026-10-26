# Blockwise

*Make time for what matters.*

Time blocking for macOS and Windows. It shows the
block you should be in, counts it down, and chimes, speaks and notifies when
it's time to switch. Each person imports or builds their own week.

- **Now screen**: current block, notes, the category's focus rule ("Slack or
  text first unless it's urgent"), a big countdown, what's next, and today's list.
- **Alerts**: rising chime and voice when a block starts, a heads-up a few
  minutes before it ends, a falling chime when a block ends with a break
  after it, and desktop notifications. You can set alerts per category or per
  block: full, notification only, or silent.
- **Extend / Skip**: extend adds +5/+10/+15 minutes and takes the time from the
  next block, so the end of the day stays put. Skip ends the block now and
  starts the next. Undo reverses either.
- **Exceptions**: change one date without touching the weekly template, or
  mark it as a day off. Extending or skipping also creates an exception for today.
- **Menu bar / tray**: closing the window keeps it running. On a Mac the menu bar
  shows `Estimating · 47m`. The tray menu has extend, skip, the journal and quit.
- **Mini timer**: a small always-on-top window with the countdown and buttons.
- **Journal**: at the end of the day it asks for a 1–5 star rating, what went
  well, what didn't, and notes. It also lists that day's extends and skips. It can
  be exported to CSV.
- **Spreadsheet import/export**: a 30-minute grid in Excel or Google Sheets
  (see below), plus a full JSON backup.

The sample week loaded on first launch is Hunter's (Converge Signs).

## Installing

Installers are built by GitHub Actions. You can get them in two ways:

- **Tagged releases.** Push a tag like `v0.1.0`. A draft GitHub Release is
  created with `Blockwise-<version>-mac-universal.dmg` and
  `Blockwise-<version>-win-x64.exe`.
- **Any CI run that built installers.** Open the run under *Actions* and
  download the `blockwise-macOS` or `blockwise-Windows` artifact.

The builds are **not code-signed**, so the first launch needs one extra step:

- **macOS**: open the .dmg and drag Blockwise to Applications. Open it once. When
  macOS blocks it, go to *System Settings → Privacy & Security* and click
  **Open Anyway**. If macOS says the app is "damaged", run
  `xattr -cr /Applications/Blockwise.app` in Terminal and open it again.
- **Windows**: when SmartScreen shows "Windows protected your PC", click
  **More info → Run anyway**.

Removing these warnings needs an Apple Developer account ($99/yr, for
signing and notarization) and a Windows code-signing certificate.
electron-builder picks both up from CI secrets (`CSC_LINK`, `APPLE_ID`, …).
Mac builds are ad-hoc signed with hardened runtime off. Turn
`build.mac.hardenedRuntime` back on when you add a Developer ID; notarization
requires it.

## Building your week in a spreadsheet

*Settings → Schedule → Blank template (.xlsx)* (or *Export my week*) gives a workbook:

| Sheet | What it holds |
|---|---|
| **Week** | Column A holds start times, one row per 30 minutes. The other columns are Monday–Sunday. Type a block title in a cell, then merge cells downward, or repeat the title, to make the block longer. Put notes on extra lines in the same cell. Leave a cell empty for free time. The last row marks the end of the day. |
| **Blocks** *(optional)* | Title → Category (and optional Day, Notes, Alerts). |
| **Categories** *(optional)* | Name, Color (`#f2b774`), default Alerts (`full`/`quiet`/`off`), Focus note. |
| **Info** *(optional)* | Name and Subtitle of the schedule. |

Times can be `7:30`, `7:30 AM`, `13:00` or real Excel times. A bare `1:00`
after `12:30` is read as 1 PM. A plain CSV of the Week grid also imports. If a
title has no category, the importer reuses the category that title had in the
current schedule.

Importing replaces the weekly template. The journal and custom dates are kept.

## Data

Everything is stored locally as JSON (`schedule.json`, `settings.json`,
`journal.json`):

- macOS: `~/Library/Application Support/Blockwise/data`
- Windows: `%APPDATA%\Blockwise\data`

*Settings → Back up everything* writes one JSON file, and importing that file restores it.

## Brand

The Blockwise identity (the logo, the Ember/Charcoal/Ivory/Peach/Slate palette, and Inter)
is described in `docs/brand-guidelines.md`. The vector masters are in `assets/brand/`.
`npm run icons` renders every app and tray icon from those SVGs: the macOS icon on
Apple's grid, the full-bleed Windows tile, and a monochrome B for the menu bar.
Inter (SIL Open Font License, `src/renderer/fonts/LICENSE.txt`) is bundled for the UI.
Ember marks focus and selected states. Small text stays Charcoal or a slightly
darker Slate (`#646c73`) so it meets WCAG AA contrast on Ivory.

## Development

```sh
npm install
npm start            # run the app
npm test             # unit tests (schedule logic, alerts, spreadsheet format)
npm run test:e2e     # drives the real app for ~2 min (use xvfb-run on Linux)
npm run dist:mac     # build a .dmg (on a Mac)
npm run dist:win     # build an installer (on Windows)
npm run icons        # regenerate icons
```

Layout:

- `src/core/`: plain JS with no Electron: the schedule model, alert timing,
  extend/skip, the spreadsheet format and the sample week. This is what the unit tests cover.
- `src/main/`: the Electron main process: windows, tray, notifications,
  file dialogs, xlsx read/write and storage.
- `src/renderer/`: the UI. `engine.js` ticks every second and fires alert events.
  `views/` holds the Now, Week, Edit, Journal and Settings screens. `mini.*` is the floating timer.

CI (`.github/workflows/ci.yml`) runs the unit and end-to-end tests on every push.
It builds installers on `v*` tags, manual runs, pull requests, and pushes whose
commit message contains `[build]`.
