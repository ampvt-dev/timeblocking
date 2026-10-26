# Blockwise

*Make time for what matters.*

Blockwise is a time-blocking app for macOS and Windows. It shows which block of
your day you're in and counts it down. When it's time to switch, it chimes, says
what's next, and shows a notification. Each person sets up their own week, either
in the app or with a spreadsheet template, and Blockwise keeps it running in the
menu bar or system tray all day.

**Contents:** [Install on Mac](#install-on-mac) · [Install on Windows](#install-on-windows) ·
[Set up your week](#set-up-your-week) · [Using Blockwise](#using-blockwise) ·
[Settings](#settings) · [Backup and moving computers](#backup-and-moving-computers) ·
[Troubleshooting](#troubleshooting) · [Development](#development)

---

## Download

Get the latest version from the **[Releases page](https://github.com/ampvt-dev/timeblocking/releases/latest)**:

| File | For |
|---|---|
| `Blockwise-<version>-mac-universal.dmg` | macOS 12 Monterey or later (Apple Silicon and Intel) |
| `Blockwise-<version>-win-x64.exe` | Windows 10 and 11 (64-bit) |
| `Blockwise-Template.xlsx` | Blank spreadsheet for setting up your week |
| `Blockwise-Example.xlsx` | A filled-in example week |

> The repository is private, so you need access to it to download from GitHub.
> To share Blockwise with someone who doesn't have access, send them the
> installer and template files directly (by email, Slack, Google Drive and so on).

The installers aren't code-signed yet, so the first launch on each computer
needs one extra click (below). After that it opens normally.

## Install on Mac

1. Open `Blockwise-<version>-mac-universal.dmg`.
2. Drag **Blockwise** onto the **Applications** folder, then eject the disk image.
3. Open **Blockwise** from Applications (or Launchpad / Spotlight).
4. macOS says it *"could not verify Blockwise is free of malware."* Click **Done**.
5. Open **System Settings → Privacy & Security**, scroll to *Security*, and click
   **Open Anyway** next to "Blockwise was blocked…". Confirm with your password or Touch ID.
6. Blockwise opens. A **B** icon appears in the menu bar at the top of the screen.

If macOS instead says *"Blockwise is damaged and can't be opened"*, open Terminal and run
the command below, then open the app again:

```sh
xattr -cr /Applications/Blockwise.app
```

**Allow notifications.** macOS asks the first time Blockwise sends one; click **Allow**.
If you missed the prompt, go to **System Settings → Notifications → Blockwise**.
Set the style to **Alerts** if you want them to stay on screen until you dismiss them.

**Updating:** install the new version the same way and choose **Replace** when
asked. Your schedule and journal are kept.

**Uninstalling:** quit Blockwise from its menu-bar icon (**Quit Blockwise**) and drag
it from Applications to the Trash. To remove your data too, delete
`~/Library/Application Support/Blockwise`.

## Install on Windows

1. Run `Blockwise-<version>-win-x64.exe`.
2. Windows SmartScreen says *"Windows protected your PC."* Click **More info**, then **Run anyway**.
3. Follow the installer. By default it installs just for you (no admin rights
   needed) and adds Start-menu and desktop shortcuts.
4. Blockwise opens, and its orange **B** icon appears in the system tray (bottom-right of the taskbar).

**Keep the tray icon visible.** Windows often hides new tray icons behind the **^**
arrow. Drag the Blockwise icon onto the taskbar, or turn it on in **Settings →
Personalization → Taskbar → Other system tray icons → Blockwise**.

**Notifications** are on by default. If you don't see them, check **Settings →
System → Notifications → Blockwise**, and make sure **Do not disturb** isn't on.

**Updating:** run the new installer. Your schedule and journal are kept.

**Uninstalling:** right-click the tray icon → **Quit Blockwise**, then go to **Settings →
Apps → Installed apps → Blockwise → Uninstall**. To remove your data too, delete
`%APPDATA%\Blockwise`.

---

## Set up your week

On first launch, Blockwise loads a sample week so you can see how it works.
Replace it with your own in one of two ways.

### Option A: build it in the app

1. Go to **Edit**.
2. Under **Weekly template**, pick a day (Mon … Sun).
3. Click **+ Add block** and fill in the start time, end time, title, category and
   (optional) notes. Repeat for each block.
4. Click **Save**. Each weekday is saved on its own.
5. To reuse a day, open another day and choose **Copy from… → Monday template** (or another day).

Blocks can't overlap. The editor marks any problems in red before you save.

### Option B: fill in a spreadsheet and import it

Use `Blockwise-Template.xlsx` from the Releases page or
[`templates/`](templates/) in this repo. You can also create one from the app with
**Settings → Schedule → Blank template (.xlsx)**, which uses your current categories.
The template opens on a **How to use** sheet with these same steps.

**In Excel:** open the file, fill it in, and save it (keep it as `.xlsx`).

**In Google Sheets:**
1. In Google Drive, choose **New → File upload** and pick the template. Open it with
   Google Sheets. (Or, inside Sheets: **File → Import → Upload**.)
2. Fill it in.
3. Choose **File → Download → Microsoft Excel (.xlsx)**. Don't download as CSV,
   because CSV loses merged cells and the extra sheets.

**Then import it:** in Blockwise go to **Settings → Schedule → Import…** and pick the
file. Blockwise shows a summary ("Found Mon 8, Tue 8 … blocks and 7 categories")
before replacing anything. Importing replaces your weekly template; your journal
and any one-off date changes are kept.

#### How the template works

| Sheet | What to put in it |
|---|---|
| **Week** | The grid. Column A holds the start time of each row (every 30 minutes). Columns B onward are days. |
| **Categories** | The kinds of blocks you have: **Name**, **Color** (hex code such as `#F2B774`), **Alerts** and an optional **Focus note** shown during those blocks (e.g. "Slack or text first unless it's urgent"). |
| **Blocks** | One row per block title from the Week sheet, with its **Category** (dropdown). Use **Day** only if a title needs a different category on some days. **Alerts** here overrides the category for that block. |
| **Info** | The schedule's **Name** and **Subtitle**, shown at the top of the Week view. |

Rules for the **Week** sheet:

- **Start a block** by typing its title in the cell where it begins, e.g. `Deep work` under Monday at 9:00 AM.
- **Make it longer** by merging the cells below it, or by typing the same title again in each cell below.
  - Excel: select the cells → **Home → Merge & Center → Merge Cells**.
  - Google Sheets: select the cells → **Format → Merge cells → Merge vertically**.
- **Add notes** on a new line inside the same cell. They appear under the title on the focus screen.
  - Excel for Windows: **Alt+Enter**. Excel for Mac: **Control+Option+Return**.
  - Google Sheets: **Ctrl+Enter** (Windows) or **⌘+Enter** (Mac).
- **Free time:** leave cells empty.
- **End of day:** the last row only marks when the day ends. Leave its cells empty.
- **Weekends:** add a `Saturday` or `Sunday` column. Delete columns for days you don't use.
- **15-minute blocks:** change the times in column A (9:00, 9:15, 9:30 …). Any even interval works.
- **Times:** `7:30`, `7:30 AM`, `13:00` and real Excel/Sheets time cells all work. A plain
  `1:00` after `12:30` is read as 1 PM.
- **Colors** come from the Categories sheet; coloring cells in the grid is optional.
- **Titles not listed on the Blocks sheet** get the first category. You can change it in the app afterwards.

`Blockwise-Example.xlsx` is a complete week built this way, if you want to see a filled-in one.

### Sharing a schedule

**Settings → Schedule → Export my week (.xlsx)** writes your current week in the template
format. Send it to a coworker as a starting point; they edit it and import it.

---

## Using Blockwise

### The Now screen

This is the main screen. It shows:

- **The block you're in:** title, notes, the time range and the category. If the category has a
  focus note (for example "Slack or text first unless it's urgent"), it's shown here.
- **A countdown and progress bar** for the time left.
- **Up next:** the next block and how long until it starts.
- **Today:** the whole day, with the current block highlighted.

Between blocks it shows **Free time** and a countdown to the next one. After the last block
it shows **Day complete** and a button to write your journal.

### Extend, skip, undo

- **+5 / +10 / +15** extends the current block. The time comes out of the next block,
  so the end of your day doesn't move. If you extend past the whole next block, that block is
  removed for today.
- **Skip to next ▸** ends the current block now and starts the next one immediately.
- **Undo** reverses the last extend or skip.

Extends and skips apply to today only and never change your weekly template. They're also
listed in that day's journal entry.

### Alerts

| When | What happens |
|---|---|
| A block starts | Rising chime, then the voice says the block, its first line of notes, and when it ends. A notification also appears. |
| A few minutes before it ends (5 by default) | Single tone and "5 minutes left in Estimating. Next: Buffer." |
| A block ends with a break after it | Falling chime and a note of what's next and when. |
| The last block of the day ends | Three-note chime, "That's the day", and the journal opens. |

Each **category** has an alert level, and any **block** can override it:
**Chime + voice + notification**, **Notification only**, or **Silent**.

Chimes and the voice are Blockwise's own sounds, so they play even when macOS Focus or
Windows Do not disturb hides the notifications. Turn the volume down in Settings, or set
blocks to Silent, if you need quiet.

### Menu bar, tray and the mini timer

Closing the Blockwise window doesn't quit it. It keeps running so alerts still fire.

- **Mac:** the menu bar shows the current block and time left, e.g. **Estimating · 47m**.
  Click it for the menu.
- **Windows:** hover the tray icon for the current block and time left. Left-click opens
  Blockwise; right-click opens the menu.
- **The menu** has the current and next block, **Extend current block** (+5/+10/+15/+30),
  **Skip to next block**, **Show Blockwise**, **Mini timer**, **Today's journal**, and **Quit Blockwise**.
- **Mini timer:** click **Mini timer** in the top bar (or in the menu) for a small window that
  stays on top of everything. It has the countdown and +5 / +10 / skip buttons. Drag it anywhere;
  **⤢** opens the full app and **✕** closes the mini timer.

To fully quit, use **Quit Blockwise** in the menu-bar/tray menu (or ⌘Q on a Mac).

### Week view

**Week** shows the whole week, laid out like a printed schedule, with a line at the current
time. Use **‹ Prev / Next ›** to look at other weeks; dates you've customized show a
*custom* tag. Click any block to edit it. Under each day:

- **Every Mon** edits the weekly template for that day.
- **This date** edits just that calendar date.

### Changing one day only

Meetings move and days off happen. To change a single date without touching your weekly
template:

1. On the **Now** screen click **Change today only…**, or go to **Edit → One specific date**
   and pick a date (or click **Today**).
2. Edit the blocks, or tick **Day off (no blocks or alerts)**.
3. Click **Save**.

That date now uses its own version. **Revert to template** puts it back to the normal week.

### End-of-day journal

When your last block ends, **Journal** opens for today:

- **How was the day?** 1 to 5 stars. Click the same star again to clear it.
- **What went well?**, **What didn't go well?**, and **Notes for tomorrow**.
- **Schedule changes today:** filled in automatically from your extends and skips.

Entries save as you type. Past days are listed on the left. **Export CSV** saves all
entries to a spreadsheet.

### Keyboard shortcuts

**⌘1 – ⌘5** (Mac) or **Ctrl+1 – Ctrl+5** (Windows) switch between Now, Week, Edit, Journal and Settings.

---

## Settings

**Alerts**
- **Chime**, **Voice announcement**, **Read the first line of notes aloud**, **Desktop notifications**: turn each on or off.
- **Heads-up before a block ends**: Off, or 1, 2, 3, 5, 10 or 15 minutes.
- **Volume**, **Voice** and **Speaking speed**. The voice list comes from your computer.
- **Test**: try the block-start, heads-up and end-of-day alerts, the voice and a notification.

**App**
- **Start Blockwise when I log in.**
- **Show the current block and time left in the menu bar** (Mac).
- **Open the journal when the last block of the day ends.**

**Categories**: color, name, default alert level and focus note for each category. A category
can only be deleted once no blocks use it.

**Schedule**
- **Name** and **Subtitle** of your schedule.
- **Import…** (.xlsx, .csv or .json), **Export my week (.xlsx)**, **Blank template (.xlsx)**.
- **Back up everything (.json)**: your schedule, custom dates, journal and settings.
- **Load sample week** / **Start from scratch**.
- **Data folder**: where your files are stored, with an **Open** button.

### Better voices

Blockwise uses your computer's built-in voices. To add more natural ones:

- **Mac:** **System Settings → Accessibility → Spoken Content → System voice → Manage Voices…**,
  then download an *Enhanced* or *Premium* voice. Restart Blockwise and pick it under **Settings → Voice**.
- **Windows:** **Settings → Time & language → Speech → Manage voices → Add voices**.
  Restart Blockwise and pick it under **Settings → Voice**.

---

## Backup and moving computers

Everything is stored on your computer:

- Mac: `~/Library/Application Support/Blockwise/data`
- Windows: `%APPDATA%\Blockwise\data`

To back up or move to a new computer, use **Settings → Back up everything (.json)**. On the
new computer, install Blockwise and use **Settings → Import…** with that file. It
restores your schedule, custom dates, journal and settings.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Mac: "could not verify…" or "damaged" on first open | See [Install on Mac](#install-on-mac): **Open Anyway** in Privacy & Security, or run the `xattr` command. |
| Windows: "Windows protected your PC" | Click **More info → Run anyway**. |
| No chime or voice | Check **Settings → Alerts** (Chime / Voice on, Volume up) and the block's alert level, then use the **Test** buttons. Check your computer's volume and output device. |
| No notifications | Mac: **System Settings → Notifications → Blockwise**, and Focus mode. Windows: **Settings → System → Notifications**, and Do not disturb. |
| Can't find the menu-bar icon (Mac) | On MacBooks with a notch, a crowded menu bar can hide icons. Remove some menu-bar items, or use the **Mini timer**. |
| Can't find the tray icon (Windows) | Click **^** in the taskbar, then drag the icon onto the taskbar. |
| Alerts stopped after the computer slept | They resume on wake. Alerts that would have fired while asleep are skipped rather than all playing at once. |
| Import says it can't find day names | The Week sheet needs a header row with day names (Monday, Tuesday … or Mon, Tue …) and a time column. Start from the template. |
| Imported blocks are only 30 minutes long | In a CSV, merged cells lose their contents. Download from Google Sheets as **.xlsx**, or repeat the title in each cell. |
| Imported times are off by 12 hours | Write times as `1:00 PM` or `13:00` instead of a plain `1:00`. |

---

## Development

```sh
npm install
npm start            # run the app
npm test             # unit tests (schedule logic, alerts, spreadsheet format, templates)
npm run test:e2e     # drives the real app for ~2 min (use xvfb-run on Linux)
npm run dist:mac     # build a .dmg (on a Mac)
npm run dist:win     # build an installer (on Windows)
npm run icons        # regenerate app/tray icons from assets/brand/*.svg
npm run templates    # regenerate templates/*.xlsx
```

Layout:

- `src/core/`: plain JS with no Electron: the schedule model, alert timing,
  extend/skip, the spreadsheet format and the sample week. This is what the unit tests cover.
- `src/main/`: the Electron main process: windows, tray, notifications,
  file dialogs, xlsx read/write and storage.
- `src/renderer/`: the UI. `engine.js` ticks every second and fires alert events.
  `views/` holds the Now, Week, Edit, Journal and Settings screens. `mini.*` is the floating timer.
- `templates/`: the spreadsheet templates, generated by `scripts/make-templates.js`.
  `test/templates.test.js` checks they import cleanly.

**Releases.** Push a version tag (`git tag v0.2.0 && git push origin v0.2.0`). CI then
builds both installers and publishes a GitHub Release with them and the templates. CI
(`.github/workflows/ci.yml`) also runs the unit and end-to-end tests on every push, and
builds installers on pull requests, manual runs, and pushes whose commit message contains
`[build]`. (macOS runners use 10× minutes on private repos, so they don't run on every push.)

**Code signing.** Builds are unsigned: Mac builds are ad-hoc signed with hardened runtime
off. Removing the first-launch warnings needs an Apple Developer account ($99/yr, for signing
and notarization) and a Windows code-signing certificate. electron-builder reads both from
CI secrets (`CSC_LINK`, `APPLE_ID`, …). Turn `build.mac.hardenedRuntime` back on when you
add a Developer ID; notarization requires it.

**Brand.** The Blockwise identity (the logo, the Ember/Charcoal/Ivory/Peach/Slate palette,
and Inter) is described in `docs/brand-guidelines.md`, with vector masters in
`assets/brand/`. Inter is bundled under the SIL Open Font License
(`src/renderer/fonts/LICENSE.txt`). Ember marks focus and selected states. Small text stays
Charcoal or a slightly darker Slate (`#646c73`) so it meets WCAG AA contrast on Ivory.
