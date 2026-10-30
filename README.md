<div align="center">

# JunctionBox

**One junction. Every runtime.**

Port inspection, plus JDK / Node.js installation and switching, all in one window.
Switching re-points an NTFS directory junction and takes about **15 ms** —
**no registry writes, no terminal restarts, no admin rights.**

[中文说明](./README.zh-CN.md) · [Download](https://github.com/LargeAkon/JunctionBox/releases/latest) · [Changelog](./CHANGELOG.md) · [Architecture](./docs/ARCHITECTURE.md)

![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D4?logo=windows&logoColor=white)
![Tech](https://img.shields.io/badge/Electron-Vue%203-646cff?logo=electron)
![License](https://img.shields.io/badge/license-MIT-green)
[![Build](https://github.com/LargeAkon/JunctionBox/actions/workflows/release.yml/badge.svg)](https://github.com/LargeAkon/JunctionBox/actions/workflows/release.yml)

</div>

![Port inspector](docs/screenshots/1-ports.png)

> The UI ships in Simplified Chinese; an English UI is on the [roadmap](#roadmap).
> The detailed documents under `docs/` are Chinese only — a [Chinese README](./README.zh-CN.md)
> mirrors this page.

## What it solves

Three things that keep costing time on Windows:

| Problem | Before | Now |
|---|---|---|
| **Port already in use** | `netstat -ano \| findstr :8080` gives a PID; then hunt it down in Task Manager | One list of port, PID, process name and full command line — kill from the row |
| **Switching JDK / Node** | Edit `JAVA_HOME`, reorder `Path`, reopen every terminal, and the IDE still has the old one | Double-click. ~15 ms. Environment variables are configured once |
| **Only one version installed** | Download from a vendor site, unzip, wire up `JAVA_HOME` by hand | The store ships 5 JDKs and 4 Node LTS lines — pick one, it installs and switches |

## Download

Grab the latest build from [**Releases**](https://github.com/LargeAkon/JunctionBox/releases/latest):

| File | Choose this if… |
|---|---|
| **`JunctionBox-Portable-x64.exe`** | You want to double-click and run. Single file, nothing written system-wide, delete the file to uninstall |
| **`JunctionBox-Setup-x64.exe`** | You want a Start Menu entry, a desktop shortcut and a custom install directory |

Windows 10 / 11, x64, about 108 MB. **Rolling back**: install the older package over the new
one; junctions and scan paths are preserved.

> SmartScreen may warn on first launch because the binaries are not code-signed.
> Click **More info → Run anyway**, or [build from source](#build-from-source).

## Quick start

1. Run `JunctionBox-Portable-x64.exe`.
2. Open **Ports** to see who is listening on what. Double-click a row to kill it.
3. Open **JDK** or **Node**, pick a version, double-click to switch.
4. Only one version installed? Click **版本库 / Store** in the top-right corner, install
   another one, and it switches automatically.
5. **Open a new terminal** and verify with `java -version` / `node -v`.

> **A new terminal is required.** Terminals that were already open — including the ones
> embedded in your IDE — keep the environment they inherited at launch. That is Windows
> behaviour, not a bug.

## Features

| Area | What it does |
|---|---|
| **Port inspector** | Scans listening ports, resolves PID → process name → full command line, kills with one click |
| **JDK switcher** | Auto-discovers installed JDKs with version and vendor, switches `JAVA_HOME` + `Path` on double-click |
| **Node switcher** | Auto-discovers Node installs, shows version, architecture and bundled npm |
| **Runtime store** | Curated catalog with on-demand downloads, switching included |
| **PATH editor** | Add or remove PATH entries per runtime, with a directory picker |
| **Self-healing** | Repairs broken junctions and stale PATH entries at startup |
| **Native look** | Mica backdrop, Fluent 2 motion, custom title bar, dark theme |

See [how versions are discovered](#how-versions-are-discovered) for scan locations and
custom path registration.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/2-jdk.png" alt="JDK switcher" /></td>
    <td width="50%"><img src="docs/screenshots/3-node.png" alt="Node switcher" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>JDK switcher</b> — one double-click, current version marked</sub></td>
    <td align="center"><sub><b>Node switcher</b> — version, architecture, bundled npm</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/5-store.png" alt="Runtime store" /></td>
    <td width="50%"><img src="docs/screenshots/6-location.png" alt="Install location" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Runtime store</b> — install without leaving the app</sub></td>
    <td align="center"><sub><b>Install location</b> — asked every time, defaulting to where your versions already live</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/4-about.png" alt="Environment" /></td>
    <td width="50%"><img src="docs/screenshots/1-ports.png" alt="Port inspector" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Environment</b> — resolved JAVA_HOME and active runtimes</sub></td>
    <td align="center"><sub><b>Port inspector</b> — who holds the port, command line included</sub></td>
  </tr>
</table>

## Why 15 milliseconds

```
Traditional  Path = C:\...\jdk-17\bin ; C:\...\node-v20 ; ...
             switching = rewrite the registry + broadcast WM_SETTINGCHANGE (seconds)

JunctionBox  JAVA_HOME   = %LOCALAPPDATA%\JavaDevTool\links\jdk   (junction)
             Path first  = %LOCALAPPDATA%\JavaDevTool\links\node  (junction)
             switching = re-point the junction. Pure filesystem operation.
```

| | Registry / Path editing | JunctionBox |
|---|---|---|
| Switch cost | Seconds + broadcast | **~15 ms** |
| Registry writes | Every switch | First-time setup only |
| Needs admin | Often | **No** |
| Cross-drive | — | Works (junctions, not symlinks) |

Why junctions instead of symbolic links, and how links are deleted without touching real
directories: [**docs/ARCHITECTURE.md**](./docs/ARCHITECTURE.md) (Chinese).

## Using the runtime store

Most machines have exactly one JDK and one Node, which means there is nothing to switch
between. The store fills that gap.

- **Catalog**: JDK 8 / 11 / 17 / 21 / 25 (Azul Zulu), Node 20 / 22 / 24 / 26 (LTS lines).
- **Why the installer stays at 108 MB**: the catalog is metadata only; binaries are fetched
  on demand. Bundling all nine runtimes would push every release past 600 MB.
- **You choose where it lands**: clicking *Install* first scans your machine and offers the
  folder your existing runtimes live in (a sibling directory), or you pick your own.
  Nothing is silently dropped into `C:`.
- **Mirror fallback per entry**: JDK uses Azul CDN → Tsinghua mirror, Node uses
  npmmirror → Tsinghua → nodejs.org. One blocked host does not break the feature.
- **Delete only touches what the store installed**: the install location may point at your
  own JDK folder, and versions there are never removable from the app.

Full mechanics (mirrors, install ledger, directory layout, delete protection):
[**docs/RUNTIME-STORE.md**](./docs/RUNTIME-STORE.md) (Chinese).

## How versions are discovered

- **JDK**: `Program Files\Java`, Adoptium, Corretto, Zulu, Microsoft, BellSoft, Semeru,
  JetBrains Runtime, `~\.jdks`, and any directory on `Path` containing `bin\java.exe`.
- **Node**: `Program Files\nodejs`, `nvm4w`, `NVM_HOME`, `NVM_SYMLINK`, `VOLTA_HOME`,
  Volta's image directory, and any directory on `Path` containing `node.exe`.

**Not detected?** Use **Add path** in the app to register any directory. Custom paths are
stored in `%APPDATA%\JavaDevTool\` and merged into every scan.

## FAQ

**Does it modify the registry?**
Once, during first-time setup, to point `JAVA_HOME` and the first `Path` entry at the junction
folders. After that, switching never touches it.

**My terminal still shows the old version.**
Processes inherit their environment at launch. Close and reopen the terminal, including the
one inside your IDE.

**Does it conflict with nvm-windows / Volta?**
They can coexist; JunctionBox detects their directories. Just don't let two tools manage the
same PATH entry.

**Where do downloaded runtimes go?**
Wherever you say. The choice is remembered in `%APPDATA%\JavaDevTool\roots.json`; with nothing
configured it falls back to `%LOCALAPPDATA%\JavaDevTool\runtimes\`. No UAC prompt, nothing
written system-wide.

**Antivirus flags it.**
Unsigned Electron binaries trip heuristic engines. The source is here — audit and build it
yourself if you prefer.

Firewall popups, GPU crashes and junction repair are covered in
[**docs/TROUBLESHOOTING.md**](./docs/TROUBLESHOOTING.md) (Chinese).

## Build from source

Requires **Node.js 20+** and **Windows**.

```bash
git clone https://github.com/LargeAkon/JunctionBox.git
cd JunctionBox
npm install

npm run dev      # develop with hot reload
npm run dist     # build NSIS installer + portable exe
```

Artifacts land in `release/`: `JunctionBox-Setup-x64.exe` and `JunctionBox-Portable-x64.exe`.
`npm run dist:dir` skips packaging and only produces `release/win-unpacked/`.

## Roadmap

- [x] GitHub Actions build and release on `v*` tag push
- [x] Runtime store with on-demand JDK / Node downloads
- [ ] Code signing to remove SmartScreen warnings
- [ ] English UI (currently Simplified Chinese)
- [ ] Per-project version pinning (`.java-version` / `.nvmrc`)
- [ ] Export / import environment profiles

## Contributing

Issues and PRs are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md).

If this saved you a few `EADDRINUSE` headaches, a ⭐ helps others find it.

## License

[MIT](./LICENSE) © 2026 LargeAkon
