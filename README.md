<div align="center">

# JunctionBox · 接线盒

**一次配置，毫秒切换。**

端口占用排查，JDK / Node.js 版本的安装与切换，都在这一个窗口里完成。
切换走 NTFS 目录联接，约 **15 毫秒**——**不写注册表，不用重开终端，不需要管理员权限。**

[English](./README.en.md) · [下载](https://github.com/LargeAkon/JunctionBox/releases/latest) · [更新日志](./CHANGELOG.md) · [架构原理](./docs/ARCHITECTURE.md)

![平台](https://img.shields.io/badge/platform-Windows%2010%2F11%20x64-0078D4?logo=windows&logoColor=white)
![技术栈](https://img.shields.io/badge/Electron-Vue%203-646cff?logo=electron)
![协议](https://img.shields.io/badge/license-MIT-green)
[![构建](https://github.com/LargeAkon/JunctionBox/actions/workflows/release.yml/badge.svg)](https://github.com/LargeAkon/JunctionBox/actions/workflows/release.yml)

</div>

![端口检测](docs/screenshots/1-ports.png)

## 它解决什么

在 Windows 上写代码，这三件事反复浪费时间：

| 痛点 | 以前 | 现在 |
|---|---|---|
| **端口被占用** | `netstat -ano \| findstr :8080` 拿到 PID，再去任务管理器翻进程名 | 一行列出端口、PID、进程名与完整命令行，选中即结束 |
| **切 JDK / Node 版本** | 改 `JAVA_HOME`、调 `Path` 顺序、重开所有终端，IDE 里还是旧版本 | 双击即切，约 15 ms，环境变量一次配好不再动 |
| **机器上只有一个版本** | 得自己去官网下载、解压、配环境变量 | 版本库内置 5 个 JDK 与 4 条 Node LTS 线，选中即装即用 |

## 下载

到 [**Releases**](https://github.com/LargeAkon/JunctionBox/releases/latest) 下载，两个文件二选一：

| 文件 | 适合谁 |
|---|---|
| **`JunctionBox-Portable-x64.exe`** | 想双击就用。单文件，不写系统目录，删掉文件即卸载 |
| **`JunctionBox-Setup-x64.exe`** | 想要开始菜单项、桌面快捷方式、自选安装路径 |

Windows 10 / 11，x64，约 108 MB。**回退旧版本**：装回旧安装包即可，已配置的联接与扫描路径不受影响。

> 首次运行可能出现 SmartScreen 蓝色提示，因为程序没有购买代码签名证书。
> 点「更多信息 → 仍要运行」即可，或者[从源码构建](#从源码构建)。

## 快速上手

1. 运行 `JunctionBox-Portable-x64.exe`。
2. **端口**页查看当前谁在监听哪些端口，双击行可结束进程。
3. **JDK** 或 **Node** 页选中版本，双击切换。
4. 只有一个版本、没得切？点右上角 **版本库**，选一个装，装完自动切过去。
5. **新开一个终端**，执行 `java -version` / `node -v` 验证。

> **必须新开终端。** 已经打开的终端、IDE 内置终端继承的是启动时的环境变量，
> 这是 Windows 的机制，不是工具的问题。

## 功能

| 模块 | 能力 |
|---|---|
| **端口检测** | 扫描监听端口，把 PID 解析成进程名与完整命令行，一键结束 |
| **JDK 切换** | 自动发现已安装 JDK，显示版本与厂商，双击切换 `JAVA_HOME` 与 `Path` |
| **Node 切换** | 自动发现 Node 安装，显示版本、架构、内置 npm 版本 |
| **版本库** | 内置清单按需下载，装完自动切换；也可写 `runtimes.txt` 指定位置 |
| **PATH 编辑** | 为每种运行时添加 / 删除 PATH 目录，带目录选择器 |
| **启动自愈** | 联接失效、PATH 残留失效项时，启动即自动修复 |
| **界面** | Mica 材质、Fluent 2 动效、自绘标题栏、深色主题 |

版本发现范围、自定义路径登记方式见 [版本是怎么被发现的](#版本是怎么被发现的)。

## 界面

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/2-jdk.png" alt="JDK 切换" /></td>
    <td width="50%"><img src="docs/screenshots/3-node.png" alt="Node 切换" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>JDK 切换</b> — 双击即切，当前版本高亮</sub></td>
    <td align="center"><sub><b>Node 切换</b> — 版本、架构与内置 npm 版本</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/5-store.png" alt="版本库" /></td>
    <td width="50%"><img src="docs/screenshots/6-location.png" alt="安装位置" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>版本库</b> — 不用离开程序就能装一个新版本</sub></td>
    <td align="center"><sub><b>安装位置</b> — 装之前先问一句，默认建议放在你现有版本的旁边</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/4-about.png" alt="环境概览" /></td>
    <td width="50%"><img src="docs/screenshots/1-ports.png" alt="端口检测" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>环境概览</b> — JAVA_HOME 解析结果与当前运行时</sub></td>
    <td align="center"><sub><b>端口检测</b> — 谁占着端口，命令行一目了然</sub></td>
  </tr>
</table>

## 为什么只要 15 毫秒

```
传统做法  Path = C:\...\jdk-17\bin ; C:\...\node-v20 ; ...
          切换 = 改注册表 + 广播 WM_SETTINGCHANGE + 等系统响应（秒级）

JunctionBox
          JAVA_HOME   = %LOCALAPPDATA%\JavaDevTool\links\jdk   ← 目录联接
          Path 首项   = %LOCALAPPDATA%\JavaDevTool\links\node  ← 目录联接
          切换 = 把联接指向另一个目录。纯文件系统操作。
```

| 对比项 | 改注册表 / 改 Path | JunctionBox |
|---|---|---|
| 切换耗时 | 秒级 + 广播等待 | **约 15 毫秒** |
| 注册表写入 | 每次切换都写 | 仅首次配置写一次 |
| 管理员权限 | 经常需要 | **不需要** |
| 跨盘符 | — | 支持（junction 而非符号链接） |

为什么用 junction 而不是符号链接、删除联接时如何避免误删真实目录，
详见 [**docs/ARCHITECTURE.md**](./docs/ARCHITECTURE.md)。

## 使用版本库

大多数机器上只装了一个 JDK 和一个 Node——那就没什么可切的了。**版本库**补的就是这一环。

- **内置什么**：JDK 8 / 11 / 17 / 21 / 25（Azul Zulu），Node 20 / 22 / 24 / 26（LTS 线）。
- **为什么安装包还是 108 MB**：清单里只有元数据，二进制按需下载。九个运行时全内置会让每个版本超过 600 MB。
- **装在哪里由你决定**：点「安装」先扫描本机已有版本，建议装到它们旁边（同级目录），也可以自己选，不会默默塞进 C 盘。
- **多镜像回退**：JDK 走 Azul CDN → 清华镜像，Node 走 npmmirror → 清华 → 官方源，单站被墙不影响使用。
- **删除只对自己装的版本生效**：安装位置可以指向你自己的 JDK 目录，那里的版本不会被本程序删除。

完整机制（镜像地址、台账、目录结构、删除保护）见 [**docs/RUNTIME-STORE.md**](./docs/RUNTIME-STORE.md)。

## 版本是怎么被发现的

工具会自动扫描常见安装位置：

- **JDK**：`Program Files\Java`、Adoptium、Corretto、Zulu、Microsoft、BellSoft、Semeru、
  JetBrains Runtime、IDEA 的 `~\.jdks`，以及 `Path` 里所有含 `bin\java.exe` 的目录。
- **Node**：`Program Files\nodejs`、`nvm4w`、`NVM_HOME`、`NVM_SYMLINK`、`VOLTA_HOME`、
  Volta 镜像目录，以及 `Path` 里所有含 `node.exe` 的目录。

**没扫到？** 在界面里点「添加路径」登记任意目录，配置存在 `%APPDATA%\JavaDevTool\`，
每次扫描都会合并进来。

## 常见问题

**会改注册表吗？**
只在首次配置时写一次，把 `JAVA_HOME` 与 `Path` 首项指向联接口录。之后切换版本完全不碰注册表。

**终端里还是旧版本？**
进程在启动时继承环境变量。关掉重开终端，包括 IDE 内置终端。

**和 nvm-windows / Volta 冲突吗？**
可以共存，工具会识别它们的安装目录。只是不要让两个工具同时管理同一个 PATH 条目。

**下载的 JDK / Node 装在哪？**
装在你选的地方。默认建议和你已有的版本放在同一目录，选择记在 `%APPDATA%\JavaDevTool\roots.json`；
没设置过时用 `%LOCALAPPDATA%\JavaDevTool\runtimes\`。不写系统目录、不弹 UAC。

**杀毒软件报毒？**
未签名的 Electron 程序容易被启发式引擎误报。源码在此，可自行审计后构建。

更多问题（防火墙弹窗点错怎么办、GPU 崩溃、联接损坏修复）见
[**docs/TROUBLESHOOTING.md**](./docs/TROUBLESHOOTING.md)。

## 从源码构建

需要 **Node.js 20+** 与 **Windows**。

```bash
git clone https://github.com/LargeAkon/JunctionBox.git
cd JunctionBox
npm install

npm run dev      # 开发模式，热更新
npm run dist     # 打包 NSIS 安装包 + 便携版
```

产物在 `release/`：`JunctionBox-Setup-x64.exe` 与 `JunctionBox-Portable-x64.exe`。
`npm run dist:dir` 只打包目录、不生成安装包，适合快速验证。

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
