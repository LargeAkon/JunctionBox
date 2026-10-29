# 架构与实现原理

本文面向想读懂或修改代码的开发者，解释 JunctionBox 的关键设计决策，
以及 Windows 平台上一系列不太直观的坑。

---

## 1. 进程模型

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
│  窗口、Mica、单飞锁、启动自愈                 │
│  core.cjs：所有系统调用                      │
└──────────────────┬──────────────────────────┘
                   │ child_process / fs / net
┌──────────────────┴──────────────────────────┐
│  Windows                                    │
│  netstat · CIM · Registry · NTFS junction   │
└─────────────────────────────────────────────┘
```

`contextIsolation` 开启，渲染进程拿不到 `require`。所有系统能力集中在 `core.cjs`，
通过 `main.cjs` 注册的 IPC handler 暴露。

## 2. IPC 接口

| Channel | 实现 | 说明 |
|---|---|---|
| `meta:info` | 内联 | 版本号、平台等元信息 |
| `ports:scan` | `core.scanPorts()` | 扫描监听端口与进程 |
| `ports:kill` | `core.killProcess(pid)` | 结束进程 |
| `env:snapshot` | `core.snapshot()` | 一次性拉取环境快照 |
| `jdk:switch` | `core.switchJdk(path)` | 切换 JDK |
| `node:switch` | `core.switchNode(path)` | 切换 Node |
| `path:add` / `path:remove` | 内联 | 维护手动登记的扫描目录 |
| `dialog:dir` | 内联 | 目录选择对话框 |
| `shell:open` | 内联 | 打开外部链接 |

`jdk:switch` 与 `node:switch` 都包在 `guardedSwitch()` 里——**单飞锁**，
防止用户连点导致两次切换并发、联接被建到一半。

## 3. 核心：用 junction 做版本切换

### 3.1 思路

环境变量**只配置一次**，之后切换完全不碰它：

```
JAVA_HOME = %LOCALAPPDATA%\JavaDevTool\links\jdk
Path 首项 = %LOCALAPPDATA%\JavaDevTool\links\node
```

这两个路径是**目录联接**，指向真实的 JDK / Node 安装目录。
切换版本 = 删除旧联接 + 指向新目录重建。

> 数据目录沿用历史名称 `JavaDevTool`（`%LOCALAPPDATA%\JavaDevTool`、`%APPDATA%\JavaDevTool`）。
> 这是**磁盘路径**而非产品名，改名会导致已有用户的环境变量与已配置版本全部失效，
> 因此产品更名为 JunctionBox 后仍保持原路径不变。

因为 `Path` 和 `JAVA_HOME` 本身没变，所以不需要写注册表、不需要广播
`WM_SETTINGCHANGE`、不需要等待系统响应。实测 **12~17 ms**。

### 3.2 为什么是 junction 而不是符号链接

| | 符号链接 (symlink) | 目录联接 (junction) |
|---|---|---|
| 需要 `SeCreateSymbolicLinkPrivilege` | 是（默认仅管理员） | **否** |
| 跨卷支持（链接在 C 盘、目标在 E 盘） | 是 | 是 |
| 目标不存在时行为 | 链接失效 | 链接失效 |
| 对老软件兼容性 | 一般 | 更好 |

普通用户权限下创建符号链接会失败，junction 不会。这是决定性因素。

### 3.3 删除联接的安全问题

**这是整个项目最危险的一行代码。**

对 junction 做递归删除，部分 API 会**跟随联接进入真实目录**，把真实的 JDK 删掉。

因此删除只允许用：

- Node：`fs.rmdirSync(link)`（删联接本身，不进入）
- PowerShell：`[IO.Directory]::Delete(path, $false)`（第二个参数 `recursive = false`）

**绝不使用** `Remove-Item -Recurse`、`rm -rf`、`fs.rmSync(p, { recursive: true })`。

## 4. 环境变量读写

### 4.1 写入

首次配置使用 .NET Registry API 而非 `reg.exe`：

```powershell
[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true).SetValue(
  'Path', $value, [Microsoft.Win32.RegistryValueKind]::ExpandString)
```

两个要点：

1. **必须显式指定 `RegistryValueKind.ExpandString`**，否则 `Path` 会从
   `REG_EXPAND_SZ` 退化成 `REG_SZ`，`%JAVA_HOME%` 这类变量不再被展开。
2. 不用 `reg.exe`，因为它常被企业安全策略拉黑。

### 4.2 广播

写完环境变量需要让资源管理器和新进程感知，标准做法是
`SendMessageTimeout(HWND_BROADCAST, WM_SETTINGCHANGE)`。

但 `Add-Type` 编译 C# 会被部分安全软件拦截。替代方案：用系统自带的 `setx`
写一个临时变量再删掉——`setx` 内部自己会发广播，且是系统签名程序。

```js
spawn("powershell", [/* setx 临时变量，再删除 */], { detached: true, stdio: "ignore" }).unref();
```

异步发起，不等待结果，避免阻塞 UI。

## 5. PowerShell 编码

中文 Windows 上，PowerShell 5.1 有两处编码陷阱：

**① 脚本文件必须是 UTF-16LE + BOM。** 否则含中文的脚本（例如路径 `E:\端口占用检测工具`）
会被按 ANSI 解析，直接乱码。

**② 输出默认走 OEM 代码页（GBK）。** Node 按 UTF-8 读回来就是 ``。

解决：让 PowerShell 把结果 `Set-Content -Encoding UTF8` 写进临时文件，再由 Node 读取；
读取后需 `replace(/^\uFEFF/, "")` 去掉 BOM。单个值则走 base64 过桥，完全绕开编码问题。

另外，管道符必须接在**同一行末尾**，换行开头写 `|` 会报「不能使用空管道元素」。

## 6. 性能优化

### 6.1 全部异步化

早期用 `spawnSync` 调 PowerShell，每次调用阻塞主进程数百毫秒，
界面表现为卡顿甚至「未响应」。全部改为 `execFile` + Promise。

### 6.2 快照合并

环境快照原本要发起 11 次 PowerShell 调用，合并为**一次**返回 JSON，
再加 `envCache` 缓存。切换成功后先用已知值更新 UI，再后台校准。

### 6.3 端口扫描

```
netstat -ano                    ← 不加 -p tcp，否则丢 IPv6 监听
Get-CimInstance Win32_Process   ← 一次拿全量进程，建 PID → 命令行映射
```

两次调用，总耗时约 600 ms，68 行端口记录。逐 PID 查询会慢一个数量级。

杀进程**按退出码判断**（0 成功 / 128 不存在），不解析中文提示文本。

## 7. 启动自愈

| 机制 | 触发条件 | 动作 |
|---|---|---|
| `healLinks()` | 联接被外部删除 | 按上次选择重建 |
| `healEnvPath()` | PATH 缺 node 项、或 `JAVA_HOME` 下没有 `bin\java.exe` | 补回 links 并清理失效项 |
| GPU 降级 | 启动崩溃计数超阈值 | `disableHardwareAcceleration()` + 4 个 appendSwitch |

GPU 崩溃在某些显卡驱动上会导致进程直接退出，因此用启动计数实现自动降级，
而不是要求用户手动加参数。

## 8. 已知限制

**① 已打开的终端不会更新。** 进程环境在启动时继承，Windows 没有全局刷新机制。
切换后必须新开终端验证。

**② 防火墙按可执行文件完整路径匹配。** 通过 junction 启动的 `node.exe`，
上报路径是 `links\node\node.exe`，与真实安装路径不同。
按真实路径写的防火墙放行规则会失效，表现为「本机访问正常、局域网设备访问失败」。
建议按**端口**放行，或为 `links\node\node.exe` 单独加规则。

**③ 防火墙弹窗不能乱关。** 取消弹窗会写入永久 Block 规则（`TCP Query User{...}`），
之后防火墙 UI 的允许按钮会变灰，只能命令行删除。

**④ 未代码签名。** SmartScreen 会提示，杀毒软件可能误报。

## 9. 界面

- 标题栏自绘，`-webkit-app-region: drag` 实现拖拽，窗口控制按钮单独处理。
- `show: false` + `ready-to-show`，避免白屏闪烁。
- 切页不用整页 opacity 过渡，改为元素级 `translateY(6px) → 0`、25 ms 错峰，
  各页面绝对定位重叠，避免闪烁。
- 设计令牌集中在 `src/style.css`，遵循 Fluent 2 的圆角、分层与缓动曲线。
