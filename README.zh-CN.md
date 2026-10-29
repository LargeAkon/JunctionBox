<div align="center">

# JunctionBox · 接线盒

**一次配置，毫秒切换。**

Windows 开发者桌面工具箱：端口占用排查、JDK / Node.js 版本一键安装与切换。
**不写注册表，不用重启资源管理器，不需要管理员权限。**

[English](./README.md) · [下载](https://github.com/LargeAkon/JunctionBox/releases) · [架构与原理](./docs/ARCHITECTURE.md)

![平台](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D4?logo=windows&logoColor=white)
![技术栈](https://img.shields.io/badge/Electron-Vue%203-646cff?logo=electron)
![协议](https://img.shields.io/badge/license-MIT-green)
[![构建](https://github.com/LargeAkon/JunctionBox/actions/workflows/release.yml/badge.svg)](https://github.com/LargeAkon/JunctionBox/actions/workflows/release.yml)

</div>

---

## 为什么做这个工具

Windows 上开发，两件事反复浪费时间：

**① 端口被占用。** `npm run dev` 报 `EADDRINUSE`，你用 `netstat -ano | findstr :8080` 拿到一个 PID，
再去任务管理器里翻进程名，最后发现是某个早该关掉的 Java 进程。一次两分钟，一天好几次。

**② 版本切换。** 改 `JAVA_HOME`、调整 `Path` 顺序、关掉所有终端重开，
结果 IDE 里跑的还是旧版本——因为它启动时继承了旧环境变量。

JunctionBox 把这两件事做成点一下鼠标。其中版本切换用的是 **NTFS 目录联接（junction）**，
所以切换只要 **约 15 毫秒**，**不写注册表**，**不需要广播环境变量**。

## 功能一览

| 模块 | 能力 |
|---|---|
| **端口检测** | 扫描监听端口，把 PID 解析成进程名与完整命令行，一键结束进程 |
| **版本库** | 内置 JDK（8/11/17/21/25）与 Node（20/22/24/26）清单，选中即下载、解压、切换，不用开浏览器、不用手工解压 |
| **JDK 切换** | 自动发现已安装 JDK，显示版本与厂商，一键切换 `JAVA_HOME` 与 `Path` |
| **Node 切换** | 自动发现 Node 安装，显示版本、架构、自带 npm 版本，一键切换 |
| **PATH 编辑** | 为每种运行时添加/删除 PATH 目录，带目录选择器 |
| **启动自愈** | 检测到联接失效、PATH 残留失效项时自动修复 |
| **界面** | Mica 材质背景、Fluent 2 动效、自绘标题栏、深色主题 |

## 界面截图

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/1-ports.png" alt="端口检测" /></td>
    <td width="50%"><img src="docs/screenshots/2-jdk.png" alt="JDK 版本切换" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>端口检测</b> — 监听端口、PID、进程名与完整命令行</sub></td>
    <td align="center"><sub><b>JDK 切换</b> — 双击即切，当前版本高亮</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/3-node.png" alt="Node 版本切换" /></td>
    <td width="50%"><img src="docs/screenshots/4-about.png" alt="关于与环境" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Node 切换</b> — 版本、架构与内置 npm 版本</sub></td>
    <td align="center"><sub><b>环境概览</b> — JAVA_HOME 解析结果、当前运行时、状态栏</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/5-store.png" alt="版本库" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub><b>版本库</b> — 不用离开程序就能装一个新版本</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/6-location.png" alt="安装位置" /></td>
  </tr>
  <tr>
    <td colspan="2" align="center"><sub><b>安装位置</b> — 装之前先问一句，默认建议和你现有的版本放同一个目录</sub></td>
  </tr>
</table>

## 下载与安装

到 [**Releases**](https://github.com/LargeAkon/JunctionBox/releases) 页面下载最新版本。

| 文件 | 类型 | 适合谁 |
|---|---|---|
| `JunctionBox-Portable-x64.exe` | 便携版，单文件 | **双击即用**，不写系统目录，删除文件即卸载 |
| `JunctionBox-Setup-x64.exe` | NSIS 安装包 | 需要开始菜单项、桌面快捷方式、自选安装目录 |

两个版本均为 **x64**，支持 **Windows 10 / 11**。**切换版本不需要管理员权限。**

> 首次运行可能出现 SmartScreen 蓝色提示，因为程序没有购买代码签名证书。
> 点「更多信息 → 仍要运行」即可。你也可以直接从源码构建，见下文。

## 快速上手

1. 双击 `JunctionBox-Portable-x64.exe`。
2. **端口**页查看当前谁在监听哪些端口。
3. 打开 **JDK** 或 **Node** 页，选中版本，点击切换。
4. 只有一个版本、没得切？点右上角 **版本库**，装一个别的版本，装完自动切过去。
5. **新开一个终端**，执行 `java -version` / `node -v` 验证。

> **必须新开终端。** 已经打开的终端、IDE 内置终端继承的是启动时的环境变量，
> 这是 Windows 的机制，不是工具的问题。

### 版本是怎么被发现的

工具会自动扫描常见安装位置：

- **JDK**：`Program Files\Java`、Eclipse Adoptium、Corretto、Zulu、Microsoft、BellSoft、Semeru、
  JetBrains Runtime、IDEA 的 `~\.jdks` 目录，以及 `Path` 里所有含 `bin\java.exe` 的目录。
- **Node**：`Program Files\nodejs`、`nvm4w`、`NVM_HOME`、`NVM_SYMLINK`、`VOLTA_HOME`、
  Volta 镜像目录，以及 `Path` 里所有含 `node.exe` 的目录。

**没扫到？** 在界面里点「添加路径」手动登记任意目录。
自定义路径保存在 `%APPDATA%\JavaDevTool\`，每次扫描都会合并进来。

## 版本库

大多数机器上只装了一个 JDK 和一个 Node——那就没什么可切的了。
两个版本页右上角的 **版本库** 就是补这一环：选一个版本，下载、解压、切换一次做完。

| | 内置版本 |
|---|---|
| JDK | 8、11、17、21、25（Azul Zulu，x64） |
| Node.js | 20、22、24、26（当前 LTS 线） |

为什么安装包还是 108MB，而不是 600MB：

- 清单里只有**元数据**（版本、体积、下载地址），二进制按需下载（Node 约 35MB、JDK 约 190MB），
  解压用 Windows 10 1803+ 自带的 `tar.exe`（bsdtar），实测 190MB 的包 **1 秒**解完。
- 每个版本都有**备用源**：JDK 走 Azul CDN → 清华镜像，Node 走 npmmirror → 清华 → 官方源。
  谁先响应就用谁，单个站点被墙不影响功能。
- 安装位置**每次都会先问你**：点「安装」先弹一个选址框。程序会扫描你机器上已有的 JDK / Node，
  例如发现 JDK 17 在 `E:\develop\Java\jdk`，就建议 JDK 25 也装进 `E:\develop\Java`（同级目录），
  一次点击即可；不同意就自己选目录，**不会默默塞进 C 盘**。
- 没扫到任何已有版本时不会预填路径，而是明说「默认位置在 C 盘」，让你先选一个常用目录。
- 勾了「以后都装到这里」后记住该位置（JDK / Node 各存一份），下次直接复用；版本库底部可以随时「更改」或「恢复默认」。
- 下载会校验字节数是否完整；解压先进临时目录，确认 `bin\java.exe`（或 `node.exe`）存在后才挪到正式位置。
  中途取消或失败，不会在列表里留下半个 JDK。
- 你已经装过同一个大版本？版本库会显示「已安装」并让你直接切换，不会再下 190MB 重装一份。
- **删除只对自己装的版本生效**。安装位置可以指到你自己的 JDK 目录，那里的版本不会被本程序删除。

安装位置存在 `%APPDATA%\JavaDevTool\roots.json`（`{"jdk":"E:\\develop\\Java"}` 这样的结构），
安装记录存在 `installed.json`。什么都不设置时用默认位置 `%LOCALAPPDATA%\JavaDevTool\runtimes\`。
旧版的 `%APPDATA%\JavaDevTool\runtimes.txt` 仍然兼容。

> 清单更新：`npm run catalog:update` 会重新读取 Azul 元数据接口与 npmmirror 索引，
> 重写 `electron/catalog.cjs`。

## 切换原理

```
传统做法：Path = C:\...\jdk-17\bin ; C:\...\node-v20 ; ...
         切换 = 改注册表 + 广播 WM_SETTINGCHANGE + 等系统响应（秒级）

JunctionBox：
  JAVA_HOME   = %LOCALAPPDATA%\JavaDevTool\links\jdk   ← 目录联接
  Path 首项   = %LOCALAPPDATA%\JavaDevTool\links\node  ← 目录联接
  切换 = 删掉旧联接，指向新目录重建。纯文件系统操作。
```

| 对比项 | 改注册表方案 | JunctionBox |
|---|---|---|
| 切换耗时 | 秒级 + 广播等待 | **约 15 毫秒** |
| 注册表写入 | 每次切换都写 | 仅首次配置写一次 |
| 管理员权限 | 经常需要 | **不需要** |
| 跨盘符 | — | 支持（junction 而非符号链接） |

为什么用 junction 而不是符号链接、删除联接时如何避免误删真实目录、
进程路径与防火墙规则的关系，都写在 [**docs/ARCHITECTURE.md**](./docs/ARCHITECTURE.md)。

## 技术栈

- **Electron**：窗口外壳、Mica 材质、IPC 通信、切换操作单飞锁、GPU 崩溃自愈
- **Vue 3 + Vite**：渲染层界面
- **Node.js 主进程**：`netstat`、`Get-CimInstance`、.NET Registry API、`fs` 联接操作
- **electron-builder**：NSIS 安装包 + 便携版打包

## 代码结构

```
electron/
  main.cjs      窗口创建、Mica、IPC 注册、启动自愈、GPU 降级
  core.cjs      端口扫描、版本发现、联接操作、环境变量读写
  catalog.cjs   内置 JDK / Node 清单（元数据 + 镜像地址，不含二进制）
  installer.cjs 下载 → 校验 → 解压 → 原子落位；安装位置探测、安装记录与删除保护
  preload.cjs   contextBridge 暴露 window.api
src/
  App.vue       自绘标题栏、导航、状态栏
  views/        PortsView（端口）、JdkView、NodeView、AboutView
  components/   VersionPanel（版本切换）、RuntimeStore（版本库）、
                InstallLocationDialog（安装选址）、ConfirmDialog
  store.js      共享响应式状态
  style.css     Fluent 2 设计令牌与元素级动效
scripts/
  dev.mjs            开发启动脚本
  update-catalog.cjs 从上游元数据重新生成 catalog.cjs
```

核心业务逻辑集中在 `electron/core.cjs`，界面与系统调用通过 IPC 完全隔离，
渲染进程拿不到 Node 能力，只能调用 preload 中显式暴露的接口。

## 从源码构建

需要 **Node.js 20+**，**Windows** 系统。

```bash
git clone https://github.com/LargeAkon/JunctionBox.git
cd JunctionBox
npm install

npm run dev      # 开发模式，热更新
npm run dist     # 打包 NSIS 安装包 + 便携版 exe
```

产物输出到 `release/` 目录：

- `JunctionBox-Setup-x64.exe` — NSIS 安装包
- `JunctionBox-Portable-x64.exe` — 便携单文件

`npm run dist:dir` 只打包目录、不生成安装包，产物在 `release/win-unpacked/`，适合快速验证。

## 常见问题

**会改注册表吗？**
只在首次配置时写一次，把 `JAVA_HOME` 和 `Path` 首项指向联接口录。之后切换版本完全不碰注册表。

**为什么终端里还是旧版本？**
进程在启动时继承环境变量。关掉重开终端，包括 IDE 内置终端。

**弹出防火墙提示该点什么？**
点「允许」。如果直接关掉弹窗，Windows 会为该可执行文件写入**永久阻止规则**，
之后防火墙界面里的「允许」按钮会变灰，无法再通过界面改回，只能用 `Remove-NetFirewallRule` 删除。

**和 nvm-windows / Volta 冲突吗？**
可以共存，工具会识别它们的安装目录。但不要让两个工具同时管理同一个 PATH 条目。

**为什么不把 JDK / Node 直接打进安装包？**
那会把 108MB 的工具变成 600MB 的下载。一个 JDK 压缩后 190MB，清单覆盖五个；
九个运行时全打包，每次发版都要传几百 MB，而且用户只能用它打包时的那几个版本。
「元数据 + 按需下载」是 nvm、fnm、sdkman 的共同做法，原因一样。

**版本库需要联网吗？**
需要，这就是上面那个取舍。除此之外的功能（端口扫描、切换、版本发现）完全离线可用。

**下载的 JDK / Node 装在哪？**
装在你选的地方。点安装会先弹选址框，默认建议和你已有的版本放在同一个目录
（例如 JDK 17 在 `E:\develop\Java\jdk`，就建议 JDK 25 也装进 `E:\develop\Java`），
也可以自己挑。选择记在 `%APPDATA%\JavaDevTool\roots.json`；没设置过时用
`%LOCALAPPDATA%\JavaDevTool\runtimes\{jdk,node}`。不写系统目录、不弹 UAC。

**能删掉下载的版本吗？**
能，点「删除」。但只对版本库自己装的版本生效，且当前正在使用的不允许删；
你自己装的 JDK 永远不会被这个按钮碰到。

**杀毒软件报毒？**
未签名的 Electron 程序容易被启发式引擎误报。源码在此，可自行审计后构建。

## 路线图

- [x] GitHub Actions 自动构建与发布（推送 `v*` 标签触发）
- [x] 内置版本库，JDK / Node 按需下载安装
- [ ] 代码签名，消除 SmartScreen 提示
- [ ] 英文界面（当前为简体中文）
- [ ] 按项目固定版本（`.java-version` / `.nvmrc`）
- [ ] 环境配置导出 / 导入

## 参与贡献

欢迎 Issue 和 PR，详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

如果这个工具帮你省下了几次 `EADDRINUSE` 的排查时间，点个 ⭐ 让更多人看到。

## 许可证

[MIT](./LICENSE) © 2026 LargeAkon
