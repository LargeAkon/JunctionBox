# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
