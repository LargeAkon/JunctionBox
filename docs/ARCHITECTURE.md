# 架构与实现原理

JunctionBox 的代码是怎么组织的、关键决策为什么这么定、Windows 上哪些坑绕不过去。
写给要读代码或改代码的人；只想用工具，回 [README](../README.md)（[中文](../README.zh-CN.md)）就够了。

## 文档分工

| 文档 | 面向谁 | 回答什么问题 |
|---|---|---|
| [README](../README.md) · [中文](../README.zh-CN.md) | 用户 | 这是什么、怎么下载、怎么用 |
| **ARCHITECTURE.md**（本文） | 开发者 | 代码在哪、原理是什么、为什么这么写 |
| [RUNTIME-STORE.md](./RUNTIME-STORE.md) | 用户 + 开发者 | 版本库：清单、镜像、选址算法、台账、目录结构 |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | 用户 | 出问题了按现象查 |
| [CHANGELOG.md](../CHANGELOG.md) | 所有人 | 每个版本改了什么（Release 说明的唯一来源） |

## 目录

1. [代码地图](#1-代码地图)
2. [进程模型与 IPC](#2-进程模型与-ipc)
3. [版本切换：目录联接](#3-版本切换目录联接)
4. [环境变量](#4-环境变量)
5. [端口扫描与进程管理](#5-端口扫描与进程管理)
6. [版本库](#6-版本库)
7. [性能](#7-性能)
8. [Windows 平台坑](#8-windows-平台坑)
9. [界面](#9-界面)
10. [安全边界](#10-安全边界)
11. [已知限制](#11-已知限制)

---

## 1. 代码地图

```
electron/
  main.cjs       主进程入口：窗口、外观、单实例锁、IPC 注册、启动自愈、测试钩子
  core.cjs       986 行   系统能力层：端口扫描、版本发现、junction 切换、环境变量读写
  installer.cjs  711 行   安装引擎：选址、下载、校验、解压、落位、台账、删除
  catalog.cjs    126 行   版本清单（纯元数据，由 npm run catalog:update 生成）
  preload.cjs     29 行   contextBridge 白名单，暴露 window.api
src/
  App.vue         406 行  自绘标题栏 + 导航 + 状态栏，全局组件挂载点
  store.js        420 行  全局响应式状态（挂到 window.__JDT 便于调试）
  style.css               Fluent 2 设计令牌：颜色、圆角、阴影、缓动
  views/                 PortsView（端口）、JdkView、NodeView、AboutView
  components/            VersionPanel（切换）、RuntimeStore（版本库 + 安装）、
                         ConfirmDialog
scripts/
  dev.mjs                npm run dev：Vite 与 Electron 联动
  update-catalog.cjs     npm run catalog:update：重写清单
  release-notes.cjs      npm run notes <ver>：由 CHANGELOG 生成 Release 说明
```

分层只有一条规矩：**所有系统调用留在 `core.cjs` / `installer.cjs`，`main.cjs` 只做编排**。
渲染进程没有任何 Node 能力，因此加一个系统功能 = 改 `core` → 注册 IPC → 加 `preload` 方法，
没有第四条路。

## 2. 进程模型与 IPC

```
┌─────────────────────────────────────────────┐
│  Renderer (Vue 3)                           │
│  无 Node 能力，只能调用 window.api           │
└──────────────────┬──────────────────────────┘
                   │ IPC (ipcRenderer.invoke)
┌──────────────────┴──────────────────────────┐
│  Preload (preload.cjs)                      │
│  contextBridge 白名单暴露接口                │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────┴──────────────────────────┐
│  Main (main.cjs)                            │
│  窗口、外观、单飞锁、启动自愈                 │
│  core.cjs / installer.cjs：所有系统调用      │
└──────────────────┬──────────────────────────┘
                   │ child_process / fs / net
┌──────────────────┴──────────────────────────┐
│  Windows                                    │
│  netstat · CIM · Registry · NTFS junction   │
└─────────────────────────────────────────────┘
```

`contextIsolation` 开启，`nodeIntegration` 关闭。

| Channel | 实现 | 说明 |
|---|---|---|
| `meta:info` | 内联 | 版本号、平台等元信息 |
| `ports:scan` | `core.scanPorts()` | 扫描监听端口与进程 |
| `ports:kill` | `core.killProcess(pid)` | 结束进程 |
| `env:snapshot` | `core.snapshot()` | 一次性拉取环境快照 |
| `jdk:switch` / `node:switch` | `core.switchJdk()` / `switchNode()` | 切换版本 |
| `path:add` / `path:remove` | 内联 | 维护手工登记的扫描目录 |
| `store:list` | `catalog.list()` + `findJdks()` / `findNodes()` | 清单、已装状态、当前安装位置 |
| `store:set-root` | `installer.setRoot()` | 记住安装位置（并登记为扫描目录） |
| `store:pick-root` | 内联 | 目录选择对话框（默认停在当前位置） |
| `store:install` | `installer.install()` | 下载并安装到指定位置（单飞） |
| `store:cancel` | `installer.cancel(id)` | 取消进行中的下载 |
| `store:remove` | `installer.uninstall()` | 删除本程序装过的运行时 |
| `install:progress` | 主进程 → 渲染进程 | 下载 / 解压进度推送 |
| `dialog:dir` · `shell:open` | 内联 | 目录选择、打开外链 |

`jdk:switch` 与 `node:switch` 都包在 `guardedSwitch()` 里——**单飞锁**，防止连点导致两次切换
并发、联接建到一半。`store:install` 同样单飞。

## 3. 版本切换：目录联接

### 3.1 为什么只要 15 毫秒

环境变量**只配置一次**，之后切换完全不碰它：

```
JAVA_HOME   = %LOCALAPPDATA%\JavaDevTool\links\jdk
Path 首项   = %LOCALAPPDATA%\JavaDevTool\links\node
```

这两个路径是**目录联接**，指向真实的安装目录。切换 = 删掉旧联接、指向新目录重建：

```
读当前联接目标 → 校验目标目录含 bin\java.exe 或 node.exe
        ↓
[IO.Directory]::Delete(link, $false)      ← 只删联接本身
        ↓
创建新联接 → 更新内存状态 → 广播（异步，不等待）
```

因为 `Path` 与 `JAVA_HOME` 本身没变，所以不需要写注册表、不需要广播 `WM_SETTINGCHANGE`、
不需要等系统响应。实测 **12~17 ms**，耗时几乎全在两次 PowerShell 进程启动上。

> 数据目录沿用历史名称 `JavaDevTool`（`%LOCALAPPDATA%\JavaDevTool`、`%APPDATA%\JavaDevTool`）。
> 这是**磁盘路径**而非产品名。改名会让已有用户的联接、环境变量与自定义扫描路径全部失效，
> 因此产品更名为 JunctionBox 后仍保持原路径，只改显示名。

### 3.2 为什么是 junction 而不是符号链接

| | 符号链接 (symlink) | 目录联接 (junction) |
|---|---|---|
| 需要 `SeCreateSymbolicLinkPrivilege` | 是（默认仅管理员） | **否** |
| 跨卷（链接在 C 盘、目标在 E 盘） | 支持 | 支持 |
| 对老软件兼容性 | 一般 | 更好 |
| 目标被删后的行为 | 链接失效 | 链接失效 |

普通用户权限下创建符号链接会失败，junction 不会。这是决定性因素——本工具的目标之一就是
**不弹 UAC**。

### 3.3 唯一必须按规矩写的一行

**这是整个项目最危险的操作。**

对 junction 做递归删除，部分 API 会**跟随联接进入真实目录**，把真实的 JDK 删光。

因此删除联接只允许：

- Node：`fs.rmdirSync(link)`（删联接本身，不进入）
- PowerShell：`[IO.Directory]::Delete(path, $false)`（第二参数 `recursive = false`）

**绝不使用** `Remove-Item -Recurse`、`rm -rf`、`fs.rmSync(p, { recursive: true })`。

同样的原则适用于版本库的删除：`uninstall()` 用 `lstat` 判断目标是不是联接，是就拒绝——
哪怕它看起来在版本库目录里。

## 4. 环境变量

### 4.1 首次写入

用 .NET Registry API 而非 `reg.exe`：

```powershell
[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true).SetValue(
  'Path', $value, [Microsoft.Win32.RegistryValueKind]::ExpandString)
```

两个要点：

1. **必须显式指定 `RegistryValueKind.ExpandString`**，否则 `Path` 会从 `REG_EXPAND_SZ`
   退化成 `REG_SZ`，`%JAVA_HOME%` 这类变量不再被展开，用户其它工具链会连锁失效。
2. 不用 `reg.exe`——它常被企业安全策略拉黑。

### 4.2 广播

写完需要让资源管理器和新进程感知，标准做法是 `SendMessageTimeout(HWND_BROADCAST,
WM_SETTINGCHANGE)`，但 `Add-Type` 编译 C# 会被部分安全软件拦截。替代方案：用系统自带的
`setx` 写一个临时变量再删掉——`setx` 内部自己会发广播，且是系统签名程序。

```js
spawn("powershell", [/* setx 临时变量，再删除 */], { detached: true, stdio: "ignore" }).unref();
```

异步发起、不等结果，避免阻塞 UI。

### 4.3 启动自愈

| 机制 | 触发条件 | 动作 |
|---|---|---|
| `healLinks()` | 联接被外部删除或目标失效 | 按上次选择重建 |
| `healEnvPath()` | PATH 缺 node 项、或 `JAVA_HOME` 下没有 `bin\java.exe` | 补回 links 并清掉失效项 |
| GPU 降级 | 启动崩溃计数超阈值 | `disableHardwareAcceleration()` + 4 个 appendSwitch |

GPU 崩溃在部分显卡驱动上会让进程直接退出，因此用启动计数自动降级，而不是要求用户手动加参数。

## 5. 端口扫描与进程管理

```
netstat -ano                    ← 不加 -p tcp，否则丢 IPv6 监听
Get-CimInstance Win32_Process   ← 一次拿全量进程，建 PID → 命令行映射
```

两次调用，约 600 ms，68 行记录。逐 PID 查询会慢一个数量级。

- 解析 `netstat` 输出时按 `LISTENING` 过滤，避免把大量 TIME_WAIT 当占用。
- 进程名与命令行来自 CIM，一次拿到，不在循环里查。
- 杀进程**按退出码判断**（0 成功 / 128 不存在），不解析中文提示文本——不同语言的 Windows
  提示语不同，正则匹配必然出错。

## 6. 版本库

内核只有一个约束：**切换只处理已存在的目录**，装了才有得切。版本库补的是「装」这一环。

这里只记设计取舍，完整机制见 [RUNTIME-STORE.md](./RUNTIME-STORE.md)。

### 6.1 清单里为什么没有二进制

一个 JDK 压缩后 190 MB、解压后 330 MB。清单覆盖 5 个 JDK + 4 条 Node LTS 线，全塞进 exe
会让安装包从 108 MB 涨到 600 MB 以上，且用户只能拿到发版时打包的那几个版本。
`catalog.cjs` 因此只存元数据与镜像链，nvm / fnm / sdkman 用的是同一个模型。

### 6.2 三个必须做对的点

| 点 | 做法 | 漏了会怎样 |
|---|---|---|
| **原子落位** | 解压进 `.tmp_<id>_<时间戳>`，确认 `bin\java.exe` / `node.exe` 存在才 rename | 取消或失败时列表里留下半个 JDK |
| **下载前校验目标** | 绝对路径、非盘符根、不是运行时本身、可写 | 下完 190 MB 才发现路径不对 |
| **按台账判归属** | 只有 `installed.json` 里的目录能删 | 安装位置指向用户自己的目录时，删除按钮等于对准他的环境 |

### 6.3 与扫描逻辑的衔接

`installer.rootOf(kind)` 返回当前安装位置（用户选的 > 默认），`findJdks()` / `findNodes()`
把它加进扫描根；选址时确认过的位置还会写进 `paths.txt` / `node_paths.txt`。所以即使用户后来
把默认位置改回 C 盘，装在 `E:\develop\Java` 里的版本仍然会被列出、仍然能切。

界面上的「已安装」按**大版本**匹配：已有 Temurin 17.0.20 时，清单里的 JDK 17 直接显示为已安装，
不会再让人多下 190 MB。

## 7. 性能

### 7.1 全异步

早期用 `spawnSync` 调 PowerShell，每次调用阻塞主进程数百毫秒，界面表现为卡顿甚至「未响应」。
全部改为 `execFile` + Promise。

### 7.2 快照合并

环境快照原本要发起 11 次 PowerShell 调用，合并为**一次**返回 JSON，再加 `envCache` 缓存。
切换成功后先用已知值更新 UI，再后台校准。

### 7.3 解压

用系统自带的 `C:\Windows\System32\tar.exe`（bsdtar 3.5+ 原生支持 zip）：190 MB 的 JDK 包
**1 秒**解完。`PowerShell Expand-Archive` 同类包要 20~40 秒，且对非 ASCII 路径有历史问题，
只作为 `tar.exe` 缺失时的兜底。

## 8. Windows 平台坑

这些不是实现选择，是绕不过去的平台行为。排查步骤见 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)。

### 8.1 PowerShell 编码

中文 Windows 上 PowerShell 5.1 有两处陷阱：

1. **脚本文件必须是 UTF-16LE + BOM**，否则含中文的脚本（例如路径 `E:\端口占用检测工具`）
   会被按 ANSI 解析，直接乱码。
2. **输出默认走 OEM 代码页（GBK）**，Node 按 UTF-8 读回来就是乱码。

解决：让 PowerShell 把结果 `Set-Content -Encoding UTF8` 写进临时文件再由 Node 读，
读取后 `replace(/^\uFEFF/, "")` 去掉 BOM；单个值则走 base64 过桥，完全绕开编码问题。

另外管道符必须接在**同一行末尾**，换行开头写 `|` 会报「不能使用空管道元素」。

### 8.2 防火墙按可执行文件全路径匹配

通过 junction 启动的 `node.exe`，上报路径是 `links\node\node.exe`，与真实安装路径不同。
按真实路径写的放行规则会失效，表现为**本机访问正常、局域网设备访问失败**——
因为本机访问走 loopback，不经过入站规则。

这是 junction 方案的直接后果，不是 bug。建议按**端口**放行（`profile=any`），
或为 `links\node\node.exe` 单独加规则。

### 8.3 防火墙弹窗不能乱关

取消 Windows 防火墙弹窗会写入永久 Block 规则（名称形如 `TCP Query User{...}`），
之后防火墙 UI 里的「允许」复选框会变灰、点不动，只能命令行删除规则。

### 8.4 已打开的终端不会更新

进程环境在启动时继承，Windows 没有全局刷新机制。切换后必须新开终端验证，
包括 IDE 内置终端。

## 9. 界面

- 标题栏自绘，`-webkit-app-region: drag` 实现拖拽，窗口控制按钮单独处理点击区。
- `show: false` + `ready-to-show`，避免白屏闪烁。
- 切页不用整页 opacity 过渡，改为元素级 `translateY(6px) → 0`、18 ms 错峰，
  各页面绝对定位重叠，避免闪烁；`prefers-reduced-motion: reduce` 时全部关闭。
- 设计令牌集中在 `src/style.css`：纯白 `#ffffff` 底、`#f5f5f7` 凹陷层、`#ececef` 描边，
  主按钮用墨色 `#17171b` 而非品牌蓝，避免与 Java / Node 的标识色抢注意力。
- 弹层层级：普通对话框 100 以下，版本库 120，确认框 400——
  要压在别的弹层之上，必须比它大。
- 安装入口只有一个：版本库底部的「安装到」一行。点「安装」直接开下，
  不再弹二次确认；进度以整行水填充表达（`--accent-soft` 从左铺到右），
  铺满后收面板，切换留在 Java / Node 页做。

### 主题

窗口背景在 Windows 11 上原本用云母（`backgroundMaterial: 'mica'`），但半透材质会
把纯白拉成半透灰，与应用自身配色冲突，已移除。现在由主进程直接写窗口背景色：
浅色 `#ffffff`、夜间 `#0d0d10`，与渲染层的 `--bg` 保持同一值，避免加载瞬间闪色。

主题选择持久化在 `%APPDATA%\JavaDevTool\settings.json`：

```json
{ "theme": "light" }   // light | dark | system
```

- 主进程 `themeMode()` 读设置，`system` 时跟随 `nativeTheme.shouldUseDarkColors`。
- `theme:set` 写入磁盘 → `syncWindowChrome()` 设背景色 → 广播 `theme:changed`，
  渲染层据此切 `html.dark` 类与 `color-scheme`。三处同步，不留色差。
- 渲染层只存 `{ mode, dark }` 两个状态，不重复判断系统偏好，避免两边判断不一致。
- 选 `system` 时监听 `nativeTheme` 的 `updated` 事件重新同步，系统切换深浅色即时生效。

## 10. 安全边界

渲染进程当作不可信区域处理，能力全部收口在主进程：

| 出口 | 策略 |
|---|---|
| `contextIsolation` | 开启；`nodeIntegration` 关闭；只经 `preload` 暴露白名单方法 |
| 外部链接 | `setWindowOpenHandler` 仅放行 `http(s)`，其余拒绝 |
| 页面跳转 | `will-navigate` 拦截，仅允许 dev server 地址（仅开发期） |
| `webview` | `will-attach-webview` 直接阻止 |
| 权限请求 | `setPermissionRequestHandler` 一律回调 `false`（摄像头、通知、剪贴板等） |
| IPC 路径参数 | `path.isAbsolute` 校验，拒绝相对路径，避免写入无效记录 |

几处容易忽略的边界：

- **`Path` 长度闸门。** 环境块上限 32767 字符，`checkPathSize()` 在写入前拦截超过
  30000 字符的 `Path`，宁可报错也不写坏用户环境。
- **结束进程。** `killProcess` 拒绝非整数、`≤ 4` 以及当前进程自身，防止误杀系统进程。
- **联接切换原子化。** 先建 `link.new` 再 rename 覆盖，不先删；目标已相同时直接返回，
  零操作。这样任何时刻路径都存在。
- **删除保护。** 只有安装台账（`installed.json`）里登记过的目录才允许删除，判断在主进程
  完成，渲染层不猜路径前缀。

## 11. 已知限制

**① 仅支持 Windows。** junction、`netstat` 输出格式、注册表布局都是 Windows 专有。
macOS / Linux 需要另一套链接方案（symlink + 不同权限模型），不是加个分支能解决的。

**② 未代码签名。** SmartScreen 会提示，部分杀软启发式引擎会误报。
源码公开，可自行审计后构建。

**③ 一个版本只能有一个「当前」。** 没有按项目固定版本（`.java-version` / `.nvmrc`），
切换是全局的。这在路线图上。

**④ 界面仅中文。** 英文界面在路线图上。
