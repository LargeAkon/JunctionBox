# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.1.0] - 2026-10-29

Installs stop assuming the C drive. Before downloading anything, JunctionBox now asks
where the runtime should go — and proposes the folder you already keep versions in.

### Added

- **Install-location prompt.** Clicking *Install* opens a small dialog instead of
  writing to `%LOCALAPPDATA%` silently. It scans the machine, and if JDK 17 lives in
  `E:\develop\Java\jdk` it offers to put JDK 25 in `E:\develop\Java` next to it — one
  click. Decline and you pick the folder yourself.
- **Location detection** (`installer.suggestRoot`). Groups discovered runtimes by their
  parent directory, drops our own store, `AppData`, drive roots and `Program Files`,
  ranks by hit count then depth, and probes writability.
- **Remembered location** per runtime kind in `%APPDATA%\JavaDevTool\roots.json`, with
  *更改* / *恢复默认* in the store footer. The currently effective path is shown there
  too, so it is never a mystery where the next install lands.
- **Install ledger** (`installed.json`) recording exactly which directories this app
  created.
- New IPC: `store:plan`, `store:set-root`, `store:pick-root`; `store:install` now takes
  the target root and a *remember* flag.

### Changed

- With no existing runtime found, the path field stays empty and the dialog states that
  the default is on `C:` — you have to pick something rather than accept a hidden default.
- **Delete is driven by the ledger, not by path prefix.** The install location may now be
  your own `E:\develop\Java`, full of your own JDKs; the uninstaller refuses anything it
  did not install, and those rows no longer show a delete button at all.
- Location is validated *before* the download (absolute, not a drive root, not a runtime
  itself, writable), so a bad target fails in a second instead of after 190 MB.
- Confirmed install locations are also registered as scan paths, so versions there stay
  visible even if the default location is later changed back.

### Fixed

- A same-named directory in a user-owned location is no longer deleted to make room;
  the new runtime gets a `-2` suffix instead.

## [4.0.0] - 2026-10-29

Runtime store — JunctionBox can now install runtimes, not only switch between them.
This is the first major release: the tool stops assuming you already have two
versions of everything.

### Added

- **Runtime store.** A curated catalog of five JDKs (8, 11, 17, 21, 25) and four
  Node.js LTS lines (20, 22, 24, 26), reachable from the **版本库 / Store** button
  on either version page. Pick one → download → unpack → switch, in one action.
- **Mirror fallback per entry.** JDK: Azul CDN → Tsinghua Adoptium mirror.
  Node: npmmirror → Tsinghua → nodejs.org. The first source that responds wins.
- **Cancellable streaming downloads** with live percentage, transferred bytes and
  throughput, surfaced through a new `install:progress` IPC channel.
- **Install-location override.** `%APPDATA%\JavaDevTool\runtimes.txt` takes an
  absolute path on its first line; runtimes then live under it instead of
  `%LOCALAPPDATA%`.
- **Guided empty state.** When only 0–1 versions are detected, both version pages
  show an inline banner pointing at the store — the exact case this release exists
  for.
- `npm run catalog:update` — regenerates `electron/catalog.cjs` from the Azul
  metadata API and the npmmirror index.

### Changed

- Runtime discovery now also scans
  `%LOCALAPPDATA%\JavaDevTool\runtimes\{jdk,node}`, so store-installed versions
  appear in the normal list and behave like any other install.
- Vendor names from the JDK `release` file are normalised (`Azul Systems, Inc.` →
  `Azul Zulu`), so the list reads consistently regardless of the distribution.
- Deleting a runtime is restricted to directories inside the runtime root, refuses
  junctions, and refuses the version currently in use.

### Notes

- The installer is still ~108 MB: the catalog ships metadata only. Bundling the
  nine runtimes would push every release past 600 MB.

## [3.0.7] - 2026-10-29

Identifier cleanup — no functional change. The binaries are otherwise identical to 3.0.6.

### Changed

- In-app product name unified to `JunctionBox`: title bar, About page, window
  title, and the `meta:info` payload no longer report the legacy Chinese name.
- `AppUserModelId` aligned with the installer `appId`
  (`com.github.largeakon.junctionbox`), so taskbar grouping and notifications
  carry the product name.

### Notes

- The on-disk data directories keep their historical names
  (`%LOCALAPPDATA%\JavaDevTool`, `%APPDATA%\JavaDevTool`) on purpose — renaming
  them would orphan every existing junction and custom scan path.

## [3.0.6] - 2026-10-29

First public release.

### Added

- **Port inspector** — lists listening ports with process name and full command
  line, one-click process termination. Uses a single `netstat -ano` pass plus one
  CIM process query (~600 ms for a full sweep).
- **JDK switcher** — auto-discovers JDKs from common vendor directories,
  `~\.jdks`, and the current `Path`; switches in ~15 ms.
- **Node switcher** — auto-discovers Node installations including nvm-windows
  and Volta layouts; shows version, architecture and bundled npm version.
- **Junction-based switching** — environment variables are configured once and
  point at stable junctions. Switching re-points the junction only: no registry
  writes, no environment broadcast, no admin rights.
- **PATH editor** — register custom scan directories through a directory picker.
- **Startup self-healing** — rebuilds deleted junctions, repairs broken PATH
  entries, and falls back to software rendering after repeated GPU crashes.
- **Fluent 2 UI** — Mica backdrop, custom title bar, element-level page
  transitions without full-page fades.

### Notes

- Binaries are not code-signed; SmartScreen may warn on first launch.
- UI language is Simplified Chinese. English UI is on the roadmap.
