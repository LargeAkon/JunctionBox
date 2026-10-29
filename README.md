<div align="center">

# JunctionBox

**One junction. Every runtime.**

A Windows desktop toolbox for developers: scan and kill port-hogging processes,
install any **JDK** or **Node.js** version with one click, and switch between them
in milliseconds — without touching the registry.

[中文文档](./README.zh-CN.md) · [Download](https://github.com/LargeAkon/JunctionBox/releases) · [Architecture](./docs/ARCHITECTURE.md)

![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D4?logo=windows&logoColor=white)
![Tech](https://img.shields.io/badge/Electron-Vue%203-646cff?logo=electron)
![License](https://img.shields.io/badge/license-MIT-green)
[![Build](https://github.com/LargeAkon/JunctionBox/actions/workflows/release.yml/badge.svg)](https://github.com/LargeAkon/JunctionBox/actions/workflows/release.yml)

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
| **Runtime store** | Ships a curated catalog of JDKs (8/11/17/21/25) and Node.js (20/22/24/26). Pick one, it downloads, unpacks and switches — no browser, no manual unzip, no `JAVA_HOME` editing. |
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
  <tr>
    <td colspan="2"><img src="docs/screenshots/5-store.png" alt="Runtime store" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub><b>Runtime store</b> — install a JDK or Node version without leaving the app</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/6-location.png" alt="Install location" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub><b>Install location</b> — asked before every download, defaulting to the folder your other versions live in</sub></td>
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
4. Only one version installed? Click **版本库 / Store**, install another one, done.
5. **Open a new terminal** and verify with `java -version` / `node -v`.

> Terminals that were already open keep the old environment. This is a Windows
> limitation, not a bug — always verify in a fresh terminal.

### How versions are discovered

JunctionBox scans common install locations automatically:

- **JDK**: `Program Files\Java`, Eclipse Adoptium, Corretto, Zulu, Microsoft, BellSoft, Semeru, JetBrains Runtime, `~\.jdks`, and any `<root>\bin\java.exe` found on your `Path`.
- **Node**: `Program Files\nodejs`, `nvm4w`, `NVM_HOME`, `NVM_SYMLINK`, `VOLTA_HOME`, Volta's image directory, and any `node.exe` found on your `Path`.

Not detected? Use **Add path** in the app to register any custom directory. Custom paths are stored in `%APPDATA%\JavaDevTool\` and merged into every scan.

## Runtime store

Most machines have exactly one JDK and one Node — which means there is nothing to
switch between. The **Store** button on either version page fills that gap: pick a
release, and it downloads, unpacks and switches to it in a single step.

| | Versions in the catalog |
|---|---|
| JDK | 8, 11, 17, 21, 25 — Azul Zulu, x64 |
| Node.js | 20, 22, 24, 26 — current LTS lines |

Why the installer stays at ~108 MB instead of ~600 MB:

- The catalog ships **metadata only** — version, size, URL. Binaries are fetched
  on demand (Node ≈ 35 MB, JDK ≈ 190 MB) and unpacked with the `tar.exe` bundled
  with Windows 10 1803+, which handles a 190 MB zip in about a second.
- Every entry has **fallback sources** — Azul CDN → Tsinghua mirror for JDKs,
  npmmirror → Tsinghua → nodejs.org for Node. The first one that responds wins,
  so a single blocked host does not break the feature.
- The install location is **asked every time**. Clicking *Install* opens a picker that
  first scans your machine for existing runtimes — if JDK 17 lives in `E:\develop\Java\jdk`,
  it offers to put JDK 25 in `E:\develop\Java` next to it (one click). Decline, and you
  choose the folder yourself. Nothing is silently dropped into `C:`.
- With no existing runtime detected, the path field starts empty and the dialog says
  outright that the default lives on `C:` — pick a folder you actually use.
- Tick *always install here* to remember the location (stored separately for JDK and
  Node); change or reset it any time from the store footer.
- Downloads are length-verified, unpacked into a temp folder, and only moved into
  place after `bin\java.exe` (or `node.exe`) is confirmed to exist. A cancelled or
  failed download never leaves a half-installed runtime in the list.
- Already have that major version installed elsewhere? The store shows it as
  installed and offers to switch, instead of downloading a duplicate 190 MB.
- **Delete only applies to runtimes JunctionBox installed.** The install location may
  point at your own JDK folder; versions there are never touched by the uninstaller.

Locations are stored in `%APPDATA%\JavaDevTool\roots.json` (one entry per kind) and the
install ledger in `installed.json`. With nothing configured the default is
`%LOCALAPPDATA%\JavaDevTool\runtimes\`. The older `runtimes.txt` override still works.

> Refreshing the catalog: `npm run catalog:update` re-reads the Azul metadata API
> and the npmmirror index and rewrites `electron/catalog.cjs`.

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
  main.cjs       Window, Mica, IPC registration, startup self-healing, GPU fallback
  core.cjs       Port scan, version discovery, junction ops, env read/write
  catalog.cjs    Built-in JDK / Node catalog (metadata + mirrors), no binaries
  installer.cjs  Download → verify → unpack → atomic move, cancellable
  preload.cjs    contextBridge → window.api
src/
  App.vue        Custom title bar, navigation, status bar
  views/         PortsView, JdkView, NodeView, AboutView
  components/    VersionPanel, RuntimeStore, ConfirmDialog
  store.js       Shared reactive state
  style.css      Fluent 2 tokens and element-level motion
scripts/
  dev.mjs            Dev launcher
  update-catalog.cjs Regenerates catalog.cjs from upstream metadata
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

**Why not bundle the JDKs and Nodes into the installer?**
Because that is how you turn a 108 MB tool into a 600 MB download. One JDK is
190 MB compressed; the catalog covers five. Bundling all nine runtimes would make
every release a multi-hundred-megabyte upload, and users would still be stuck with
whatever versions happened to be baked in. Metadata + on-demand download is what
nvm, fnm and sdkman all do for the same reason.

**Does the runtime store need the internet?**
Yes — that is the tradeoff above. Everything else (port scanning, switching,
discovery) works fully offline.

**Where does it put downloaded runtimes?**
Wherever you say. The install dialog proposes the folder your existing runtimes already
live in (`E:\develop\Java`, say) and lets you pick another one. The choice is remembered
in `%APPDATA%\JavaDevTool\roots.json`; with nothing configured it falls back to
`%LOCALAPPDATA%\JavaDevTool\runtimes\{jdk,node}`. Nothing is installed system-wide and no
admin prompt appears.

**Can I delete a downloaded runtime from the app?**
Yes, with the **删除** button — but only for versions the store installed, and only
when it is not the active one. Your own JDKs are never touched.

## Roadmap

- [x] GitHub Actions build + automatic Release publishing on tag push
- [x] Runtime store with on-demand JDK / Node downloads
- [ ] Code signing to remove SmartScreen warnings
- [ ] English UI (currently Simplified Chinese)
- [ ] Per-project version pinning (`.java-version` / `.nvmrc`)
- [ ] Export / import environment profiles

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

If this saved you a few `EADDRINUSE` headaches, a ⭐ helps others find it.

## License

[MIT](./LICENSE) © 2026 LargeAkon
