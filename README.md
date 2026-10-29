<div align="center">

# JunctionBox

**One junction. Every runtime.**

A Windows desktop toolbox for developers: scan and kill port-hogging processes,
and switch between installed **JDK** and **Node.js** versions in milliseconds —
without touching the registry.

[中文文档](./README.zh-CN.md) · [Download](https://github.com/LargeAkon/JunctionBox/releases) · [Architecture](./docs/ARCHITECTURE.md)

![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D4?logo=windows&logoColor=white)
![Tech](https://img.shields.io/badge/Electron-Vue%203-646cff?logo=electron)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

## Why

Two problems kept wasting my time on Windows:

1. **`npm run dev` fails with `EADDRINUSE`** — and `netstat -ano | findstr` gives you a PID, not an answer.
2. **Switching JDK or Node versions** means editing `JAVA_HOME`, reordering `Path`, reopening every terminal, and still getting the wrong version because some IDE cached the old one.

JunctionBox solves both. Version switching is done by re-pointing an **NTFS directory junction**, so it costs **~15 ms**, writes **nothing to the registry**, and needs **no environment broadcast**.

## Features

| Area | What it does |
|---|---|
| **Port inspector** | Scans listening ports, resolves PID → process name → full command line, and kills the process with one click. |
| **JDK switcher** | Auto-discovers installed JDKs, shows version and vendor, switches `JAVA_HOME` + `Path` instantly. |
| **Node switcher** | Auto-discovers Node installations, shows version, arch and bundled npm version, switches instantly. |
| **PATH editor** | Add or remove PATH entries per runtime, with a directory picker. |
| **Self-healing** | Detects broken links and stale PATH entries on startup and repairs them automatically. |
| **Native look** | Mica backdrop, Fluent 2 motion, custom title bar, dark theme. |

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/1-ports.png" alt="Port inspector" /></td>
    <td width="50%"><img src="docs/screenshots/2-jdk.png" alt="JDK version switcher" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Port inspector</b> — every listener with PID, process and full command line</sub></td>
    <td align="center"><sub><b>JDK switcher</b> — one click, current version marked</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/3-node.png" alt="Node version switcher" /></td>
    <td width="50%"><img src="docs/screenshots/4-about.png" alt="About and environment" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Node switcher</b> — version, architecture and bundled npm</sub></td>
    <td align="center"><sub><b>Environment</b> — resolved JAVA_HOME, active runtimes, live status bar</sub></td>
  </tr>
</table>

> The UI is Simplified Chinese in this release. English is on the [roadmap](#roadmap).

## Download

Get the latest build from [**Releases**](https://github.com/LargeAkon/JunctionBox/releases).

| File | Type | Choose this if… |
|---|---|---|
| `JunctionBox-Portable-x64.exe` | Portable, single file | You want to double-click and run. No installation, no leftovers. |
| `JunctionBox-Setup-x64.exe` | NSIS installer | You want a Start Menu entry, a desktop shortcut, and a custom install directory. |

Both are **x64**, **Windows 10/11**. No admin rights required for version switching.

> SmartScreen may warn on first launch because the binaries are not code-signed.
> Click **More info → Run anyway**. Building from source is always an option — see below.

## Quick start

1. Run `JunctionBox-Portable-x64.exe`.
2. Open the **Ports** page to see who is listening on what.
3. Open **JDK** or **Node**, pick a version, click switch.
4. **Open a new terminal** and verify with `java -version` / `node -v`.

> Terminals that were already open keep the old environment. This is a Windows
> limitation, not a bug — always verify in a fresh terminal.

### How versions are discovered

JunctionBox scans common install locations automatically:

- **JDK**: `Program Files\Java`, Eclipse Adoptium, Corretto, Zulu, Microsoft, BellSoft, Semeru, JetBrains Runtime, `~\.jdks`, and any `<root>\bin\java.exe` found on your `Path`.
- **Node**: `Program Files\nodejs`, `nvm4w`, `NVM_HOME`, `NVM_SYMLINK`, `VOLTA_HOME`, Volta's image directory, and any `node.exe` found on your `Path`.

Not detected? Use **Add path** in the app to register any custom directory. Custom paths are stored in `%APPDATA%\JavaDevTool\` and merged into every scan.

## How switching works

```
Before:  Path = C:\...\jdk-17\bin ; C:\...\node-v20 ; ...
         → switching means rewriting the registry and broadcasting WM_SETTINGCHANGE

After:   JAVA_HOME        = %LOCALAPPDATA%\JavaDevTool\links\jdk   (junction)
         Path (first)     = %LOCALAPPDATA%\JavaDevTool\links\node  (junction)
         → switching = delete the junction, create it again pointing at another folder
```

| | Registry editing | JunctionBox |
|---|---|---|
| Switch cost | Seconds + broadcast | **~15 ms** |
| Registry writes | Every switch | Only the first-time setup |
| Needs admin | Often | **No** |
| Cross-drive | — | Works (junctions, not symlinks) |

Details, including why junctions are used instead of symbolic links and how links are deleted safely, are in [**docs/ARCHITECTURE.md**](./docs/ARCHITECTURE.md).

## Tech stack

- **Electron** — shell, Mica backdrop, IPC, guarded single-flight switching
- **Vue 3** + **Vite** — renderer UI
- **Node.js (main process)** — `netstat`, `Get-CimInstance`, .NET Registry API, `fs` junction operations
- **electron-builder** — NSIS + portable packaging

## Project structure

```
electron/
  main.cjs      Window, Mica, IPC registration, startup self-healing, GPU fallback
  core.cjs      Port scan, version discovery, junction ops, env read/write
  preload.cjs   contextBridge → window.api
src/
  App.vue       Custom title bar, navigation, status bar
  views/        PortsView, JdkView, NodeView, AboutView
  components/   VersionPanel, ConfirmDialog
  store.js      Shared reactive state
  style.css     Fluent 2 tokens and element-level motion
scripts/dev.mjs Dev launcher
```

## Build from source

Requires **Node.js 20+** and **Windows**.

```bash
git clone https://github.com/LargeAkon/JunctionBox.git
cd JunctionBox
npm install

npm run dev        # develop with hot reload
npm run dist       # build NSIS installer + portable exe
```

Artifacts are written to `release/`:

- `JunctionBox-Setup-x64.exe` — NSIS installer
- `JunctionBox-Portable-x64.exe` — portable single file

`npm run dist:dir` skips packaging and only produces `release/win-unpacked/` for quick testing.

## FAQ

**Does it modify the registry?**
Only once, to point `JAVA_HOME` and the first `Path` entry at the junction folder. After that, switching versions never touches it.

**Why does my terminal still show the old version?**
Processes inherit their environment at launch. Close and reopen the terminal — including the one embedded in your IDE.

**A firewall popup appeared. What should I click?**
Click **Allow**. Dismissing the dialog makes Windows write a *permanent block rule* for that executable, and the firewall UI will then grey out the allow button. If that already happened, remove the rule with `Remove-NetFirewallRule`.

**Does it conflict with nvm-windows / Volta?**
They can coexist. JunctionBox detects their install directories. Just don't let two tools manage the same PATH entry at the same time.

## Roadmap

- [x] GitHub Actions build + automatic Release publishing on tag push
- [ ] Code signing to remove SmartScreen warnings
- [ ] English UI (currently Simplified Chinese)
- [ ] Per-project version pinning
- [ ] Export / import environment profiles

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

If this saved you a few `EADDRINUSE` headaches, a ⭐ helps others find it.

## License

[MIT](./LICENSE) © 2026 LargeAkon
