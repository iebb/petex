# Petex

A standalone macOS and Windows pet app with no chat, coding tools, accounts, or network services.

Petex lives in the menu bar / system tray. Its transparent companion window floats on the desktop. Click your pet to wave, hold for 550 ms to jump, drag to move, and right-click for its menu. Movement beyond 6 pixels starts a drag and cancels the long press. During dragging, v2 pets look in the movement direction using all 16 gaze poses; v1 pets use their left/right movement rows. Position updates run approximately every 16 ms while pressed, and direction filtering prevents flickering when slowing or stopping. Close settings with **Done** to leave your pet hanging out. Quit from the tray when you're finished.

## Run

Requires Node.js 22.12 or newer and the platform’s native build tools (Xcode Command Line Tools on macOS or Visual Studio C++ Build Tools on Windows). The first desktop run downloads Electron before starting the app or its tests.

```sh
npm ci
npm start
```

## Bring your Codex pets

- **Import from Codex** imports custom pets from `$CODEX_HOME/pets`, or `~/.codex/pets` by default (`%USERPROFILE%\.codex\pets` on Windows).
- **Import folder** opens a folder picker. Choose the folder containing `pet.json` and its sprite sheet.
- **Import a file** accepts a `pet.json`, a ZIP containing one pet, or a raw PNG / WebP sprite atlas. Files and folders can also be dropped onto settings.
- Importing copies the artwork into Petex's private library. Identical artwork is deduplicated. Original files are never changed.
- Select a pet and click **Delete** to remove the Petex copy after confirmation. Right-click and the Delete key also work. Original source files stay untouched; Miso is always available.
- **Open folder** opens the imported pets folder in Finder or File Explorer.

Supported Codex formats:

| Format | Atlas | Behavior |
| --- | --- | --- |
| v1 (including omitted version) | 1536 × 1872, 8 × 9 cells | Original animation rows |
| v2 | 1536 × 2288, 8 × 11 cells | Original rows plus 16 cursor gaze directions |

Every cell is 192 × 208. Standard rows retain Codex's frame counts and durations. Weighted random playback uses all eight non-idle rows: wave, jump, sad, wait, work, look, walk left, and walk right. The animation picker lets you play any supported row manually. Built-in Miso uses its four supported actions.

```json
{
  "id": "my-friend",
  "displayName": "My friend",
  "description": "A tiny desktop companion.",
  "spriteVersionNumber": 2,
  "spritesheetPath": "spritesheet.webp"
}
```

The sprite sheet must be a static PNG or WebP, smaller than 32 MB, inside the pet folder. ZIPs must contain exactly one manifest. File paths and decoded image dimensions are validated. Miso is original vector artwork included with Petex; imported artwork remains subject to its own license. Codex built-in artwork is not bundled. **Built-in pets** copies compatible atlases from your installed ChatGPT / Codex app. If the app is not detected, select its application bundle, installation folder, or app.asar. Codex discovery and built-in pet imports are available in the GitHub build. The Mac App Store build supports only user-selected pet files and folders.

## Simple settings

Pet size (48–240 px), always on top, animations, cursor gaze, launch at login, and show / hide. Choose **Quiet**, **Calm**, or **Playful** behaviour. Calm leaves 45–120 seconds between actions; Playful uses 15–40 seconds. Waves and looking around are more common than jumps or sad poses. Occasional short walks move the pet within its current display. Clicking, dragging, pausing, or hiding interrupts a walk. Quiet keeps the idle animation and manual interactions without automatic actions.

**Snap to edges** gently snaps a released drag near a display edge. **Hide in fullscreen** temporarily hides the pet while another app fills its display. The pet returns when fullscreen ends, preserving your show / hide preference. **⌘⇧P** on macOS or **Ctrl+Shift+P** on Windows toggles visibility globally; turn the shortcut off if you prefer. Settings reports if another app already uses it. **Reset position** restores a misplaced pet to the primary display. Positions stay within a connected display’s work area.

Settings, menus, dialogs, and errors support English (UK), Simplified Chinese, Traditional Chinese, Japanese, Spanish, and French. The language follows the system by default and can be changed in settings. Switch pets directly in the tray’s **Choose pet** menu.

**Export pet** saves a Codex-compatible ZIP with its manifest and artwork. **Back up library** saves all imported pets in one ZIP; restore it with **import a file**. Identical artwork is deduplicated on restore. Backups contain pet artwork and metadata; Miso is included with the app. Library backups support up to 100 pets and 256 MB. Export individual pets for larger collections.

Static previews and paused pets stop scheduling draws. Hidden pets stop cursor polling and automatic actions. Screen lock and system sleep suspend activity, and unlocking resumes it without overriding your show / hide choice. Fullscreen detection uses a local helper that checks the foreground window’s geometry; it never captures screen content or reads window titles.

Settings and copied pets are stored in Electron's `userData` directory: `~/Library/Application Support/Pedex` on macOS and `%APPDATA%\Pedex` on Windows. There is no telemetry, account, remote content, or API key. Renderers are sandboxed with context isolation; the preload exposes only purpose-specific operations.

## Test and package

```sh
npm run check
npm run test:desktop
npm run pack
npm run dist:mac
npm run dist:win
npm run test:packaged
```

Builds land in `release/`. Build the macOS DMG / ZIP on macOS; build the Windows NSIS installer on Windows. The [Desktop packages workflow](https://github.com/iebb/petex/actions/workflows/build.yml) runs on pushes to `master`, pull requests, version tags, or manual dispatch. It builds macOS Apple Silicon, macOS Intel, and Windows x64 on native runners. Each job runs unit and desktop tests, builds installers, verifies packaged source and native libraries, then runs the desktop tests against the packaged executable. Installers are available in the workflow run’s artifacts. After all three jobs pass, pushes to master publish a GitHub Release with all five installers and SHA256SUMS.txt. Versions use major.minor.commit-height: edit the first two numbers in package.json manually; CI replaces the third with `git rev-list --count HEAD` using full history. Run `npm run version:ci` for the same version locally. Existing published versions are left unchanged. Version tags must match the computed version. The macOS bundle identifier is `ad.neko.petex`.

GitHub downloads are unsigned. No in-app updater is configured.

For cross-packaging, install Sharp for the target first (for example, `npm install --no-save --os=win32 --cpu=x64 sharp`), then run the build. This replaces the host native dependency; restore it with `npm ci` before running local tests. The packaging hook rejects missing target binaries. Native libraries are unpacked as required by [Sharp’s Electron instructions](https://sharp.pixelplumbing.com/install/#electron).

`build/icon-source.png` and `build/tray-source.png` are the icon sources; `node scripts/icons.cjs` regenerates PNG/ICO assets and, on macOS, ICNS. All generated icons are committed so Windows builds don't require Apple's `iconutil`.

For isolated testing, `PEDEX_DATA_DIR` changes only Petex's storage directory and disables login registration; `PEDEX_CODEX_HOME` points discovery at a fixture home. Normal use needs neither variable.

Implementation references: [Electron window interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions), [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), and [electron-builder platform builds](https://www.electron.build/docs/features/multi-platform-build/).

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Imported pets retain their own licenses.
