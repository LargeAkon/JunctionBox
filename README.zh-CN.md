<div align="center">

# JunctionBox · 接线盒

**一次配置，毫秒切换。**

Windows 开发者桌面工具箱：端口占用排查、JDK / Node.js 版本一键切换。
**不写注册表，不用重启资源管理器，不需要管理员权限。**

[English](./README.md) · [下载](https://github.com/LargeAkon/JunctionBox/releases) · [架构与原理](./docs/ARCHITECTURE.md)

![平台](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D4?logo=windows&logoColor=white)
![技术栈](https://img.shields.io/badge/Electron-Vue%203-646cff?logo=electron)
![协议](https://img.shields.io/badge/license-MIT-green)

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
| **JDK 切换** | 自动发现已安装 JDK，显示版本与厂商，一键切换 `JAVA_HOME` 与 `Path` |
| **Node 切换** | 自动发现 Node 安装，显示版本、架构、自带 npm 版本，一键切换 |
| **PATH 编辑** | 为每种运行时添加/删除 PATH 目录，带目录选择器 |
| **启动自愈** | 检测到联接失效、PATH 残留失效项时自动修复 |
| **界面** | Mica 材质背景、Fluent 2 动效、自绘标题栏、深色主题 |

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
4. **新开一个终端**，执行 `java -version` / `node -v` 验证。

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
  core.cjs      端口扫描、版本发现、联接操作、环境变量读写（约 950 行）
  preload.cjs   contextBridge 暴露 window.api
src/
  App.vue       自绘标题栏、导航、状态栏
  views/        PortsView（端口）、JdkView、NodeView、AboutView
  components/   VersionPanel（版本切换面板）、ConfirmDialog
  store.js      共享响应式状态
  style.css     Fluent 2 设计令牌与元素级动效
scripts/dev.mjs 开发启动脚本
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

产物输出到 `package.json` 中配置的 `out*/` 目录。

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

**杀毒软件报毒？**
未签名的 Electron 程序容易被启发式引擎误报。源码在此，可自行审计后构建。

## 路线图

- [ ] GitHub Actions 自动构建与发布
- [ ] 代码签名，消除 SmartScreen 提示
- [ ] 英文界面（当前为简体中文）
- [ ] 按项目固定版本
- [ ] 环境配置导出 / 导入

## 参与贡献

欢迎 Issue 和 PR，详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

如果这个工具帮你省下了几次 `EADDRINUSE` 的排查时间，点个 ⭐ 让更多人看到。

## 许可证

[MIT](./LICENSE) © 2026 LargeAkon
