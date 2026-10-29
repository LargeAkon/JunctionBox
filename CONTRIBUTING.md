# Contributing to JunctionBox

Thanks for taking the time. This project is small on purpose — please keep it that way.

## Development setup

Requirements: **Windows 10/11**, **Node.js 20+**, **npm**.

```bash
git clone https://github.com/LargeAkon/JunctionBox.git
cd JunctionBox
npm install
npm run dev
```

`npm run dev` starts Vite and Electron together with hot reload for the renderer.

Build distributables:

```bash
npm run dist
```

## Where to make changes

| You want to… | Edit |
|---|---|
| Change scanning / switching logic | `electron/core.cjs` |
| Add an IPC capability | `electron/main.cjs` + `electron/preload.cjs` |
| Change a page | `src/views/*.vue` |
| Change shared state | `src/store.js` |
| Change look and motion | `src/style.css` |

## Ground rules

1. **Never recursively delete a junction.** Use `fs.rmdirSync` or
   `[IO.Directory]::Delete(path, $false)`. A recursive delete can follow the link
   and wipe a real JDK installation. See `docs/ARCHITECTURE.md` §3.3.
2. **No blocking calls on the main process.** Use `execFile` + Promise, never
   `spawnSync` for shelling out to PowerShell.
3. **Keep the renderer sandboxed.** New capabilities must go through the preload
   whitelist; do not expose `require` or `ipcRenderer` directly.
4. **Write PowerShell scripts as UTF-16LE with BOM** if they contain non-ASCII
   text, and return structured output through a UTF-8 temp file or base64.
5. **Preserve `REG_EXPAND_SZ`** when writing `Path`.

## Commit style

Use concise, imperative messages, optionally prefixed:

```
feat: detect SDKMAN installations
fix: avoid blocking main process during port scan
docs: explain firewall behaviour with junctions
refactor: merge env snapshot into a single PowerShell call
```

## Pull requests

- One logical change per PR.
- Describe **what you tested on Windows**, not just what you changed.
- If you touch version switching, say which JDK/Node versions you switched between.
- Update `CHANGELOG.md` under an `Unreleased` heading for user-visible changes.

## Reporting bugs

Please include:

- Windows version and build (`winver`)
- JunctionBox version
- The exact version of JDK / Node involved
- Terminal output, if the issue involves version detection
- Whether a firewall or antivirus prompt appeared

## Good first issues

- Translating the UI to English
- Adding more JDK vendor scan paths
- Improving process-name resolution for unusual runtimes
- CI: GitHub Actions build and release automation
