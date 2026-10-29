# 架构与实现原理

本文面向想读懂或修改代码的开发者，解释 JunctionBox 的关键设计决策，
以及 Windows 平台上一系列不太直观的坑。

**文档导航**

| 文档 | 面向谁 | 讲什么 |
|---|---|---|
| [README](../README.md) | 普通用户 | 这是什么、怎么下载、怎么用 |
| **ARCHITECTURE.md**（本文） | 开发者 | 进程模型、IPC、junction 原理、切换与环境变量的实现 |
| [RUNTIME-STORE.md](./RUNTIME-STORE.md) | 用户 + 开发者 | 版本库机制：清单、镜像、安装位置、台账与删除保护 |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | 用户 | 按现象排查：终端旧版本、防火墙、联接损坏、白屏 |
| [CHANGELOG.md](../CHANGELOG.md) | 所有人 | 每个版本改了什么（GitHub Release 说明的来源） |

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
| `store:list` | `catalog.list()` + `findJdks/ findNodes` | 版本清单、已装状态与安装位置 |
| `store:plan` | `installer.suggestRoot()` | 反推用户的安装位置，供选址框使用 |
| `store:set-root` | `installer.setRoot()` | 记住安装位置（并登记为扫描目录） |
| `store:pick-root` | 内联 | 目录选择对话框（默认停在建议位置） |
| `store:install` | `installer.install()` | 下载并安装运行时到指定位置（单飞） |
| `store:cancel` | `installer.cancel(id)` | 取消进行中的下载 |
| `store:remove` | `installer.uninstall()` | 删除本程序装过的运行时 |
| `install:progress` | 主进程 → 渲染进程 | 下载/解压进度推送 |
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

## 8. 版本库：下载安装运行时

内核只有一个约束：**切换**只处理已经存在的目录，装了才有得切。
版本库补的是「装」这一环。

### 8.1 为什么清单里没有二进制

一个 JDK 压缩后 190MB、解压后 330MB；Node 约 35MB。清单覆盖 5 个 JDK + 4 个 Node，
全塞进 exe 会让安装包从 108MB 涨到 600MB 以上，而且用户只能拿到发版时打包的那几个版本。

因此 `electron/catalog.cjs` 只存**元数据**：

```js
{ id, kind, feature, label, ver, vendor, tag, sizeMb,
  sources: [ 主源URL, 备用源URL ] }
```

nvm、fnm、sdkman 用的都是这个模型。

### 8.2 镜像与回退

| 运行时 | 源顺序 | 实测 |
|---|---|---|
| JDK | Azul CDN → 清华 Adoptium 镜像 | 5.2 MB/s |
| Node | npmmirror → 清华 nodejs-release → nodejs.org | 9.5 MB/s |

`sources` 按顺序尝试，前一个失败（HTTP 非 200、连接超时、字节数不符）才换下一个。
国内环境下 Azul CDN 与 npmmirror 都不走 GitHub，避免了最常见的下载卡死。

### 8.3 下载

`https.get` + 手动跟随 302（`downloadOne`）。手动而不是用第三方库，是因为要三件事：

- **可取消**：`ctx.req.destroy()` 立刻断开，临时文件在 `finally` 里清掉。
- **可计量**：`content-length` 与实际累计字节对比，短包直接判失败，不会把半截 zip 交给解压器。
- **不让代理乱改**：显式 `Accept-Encoding: identity`，否则某些 CDN 会 gzip 一遍，
  `content-length` 与实际写入量对不上，进度条会跳。

进度按 140ms 节流，通过 `install:progress` 推给渲染进程。

### 8.4 解压

用系统自带的 `C:\Windows\System32\tar.exe`（bsdtar 3.5+ 原生支持 zip）：

```js
spawn(tar, ["-xf", zip, "-C", dest])
```

实测 190MB 的 JDK 包 **1 秒**解完。`PowerShell Expand-Archive` 同类包要 20~40 秒，
且对非 ASCII 路径有历史问题，只作为 `tar.exe` 缺失时的兜底。

### 8.5 原子落位

```
下载 → .tmp_<id>_<时间戳>/ → 结构校验 → rename 到最终目录
```

- 最终目录名由**包内数据**决定，不用清单里的版本号：
  JDK 读 `release` 里的 `JAVA_VERSION` + `IMPLEMENTOR`（→ `zulu-21.0.13`），
  Node 取目录名（→ `v22.23.4`）。备用源的小版本可能与主源不同，这样才不会对不上。
- 只有确认 `bin\java.exe` / `node.exe` 存在后才 rename，所以取消或失败不会在列表中留下半个运行时。
- 目标目录重名时先看归属：自己以前装的直接清掉重装；**不是自己装的一律让位**
  （`zulu-25.0.1-2`），绝不覆盖用户的目录。
- 删除只认**安装记录**，`lstat` 必须不是联接，且不能是当前联接指向的目录。

### 8.6 安装位置：每次先问一句

默认位置（`%LOCALAPPDATA%\JavaDevTool\runtimes\<kind>`）在 C 盘，但很多人的 JDK 都在
`E:\develop\Java`。直接把新版本塞进 C 盘，等于把用户的环境拆成两半：重装系统、换盘、
清理空间时，只有一半找得到。

所以点「安装」不是直接开始下载，而是先弹选址框：

```
安装 JDK 25 · 先选个位置
(•) 和现有版本放在一起                    ← 推荐
    E:\develop\Java
    检测到 3 个已有版本：jdk、jdk8、jdk7
( ) 自定义位置   [ E:\develop\Java    ] [选择…]
[✓] 以后 JDK 都装到这里        [取消] [开始安装]
```

建议位置由 `installer.suggestRoot(kind, dirs)` 算出，规则很朴素：

1. 取每个已发现运行时的**上级目录**（`E:\develop\Java\jdk` → `E:\develop\Java`）；
2. 剔除自家版本库目录、AppData 里的、盘符根目录、`Program Files` 这类父目录；
3. 按命中数量排序，同样多时取更深的那层（`E:\develop\Java` 比 `E:\develop` 更准）；
4. 逐个试写 `.jbox_probe_*` 判断可写，选第一个可写的。

结果就是：JDK 建议 `E:\develop\Java`，Node 建议 `E:\develop\node\versions`。
**没有建议时不预填路径**，而是明说默认位置在 C 盘，逼用户先选一个常用目录——
默认值和「帮用户决定」是两件事。

### 8.7 位置与归属的持久化

| 文件 | 内容 |
|---|---|
| `%APPDATA%\JavaDevTool\roots.json` | `{ "jdk": "E:\\develop\\Java", "node": "E:\\develop\\node\\versions" }` |
| `%APPDATA%\JavaDevTool\installed.json` | `{ "jdk": ["E:\\develop\\Java\\zulu-25.0.1"] }` |
| `%APPDATA%\JavaDevTool\runtimes.txt` | 旧版的基目录配置，仍兼容 |

只有 `installed.json` 里记着的目录才允许删除。这条不是洁癖：安装位置可以指到用户
自己的 JDK 目录，那里全是他自己的版本，按「在根目录下」放行就等于给他一把删除
自己环境的刀。因此「删除」按钮由主进程的 `installer.isManaged()` 决定，
渲染进程不再通过路径前缀猜测。

### 8.8 与扫描逻辑的衔接

`installer.rootOf(kind)` 返回当前安装位置（用户选的 > 默认），
`findJdks()` / `findNodes()` 把它加进扫描根；选址时确认过的位置还会写进
`paths.txt` / `node_paths.txt`，所以即使用户后来把默认位置改回 C 盘，
装在 `E:\develop\Java` 里的版本仍然会被列出来、仍然能被 junction 切换。

「已安装」按**大版本**匹配，用户已有 Temurin 17.0.20 时，清单里的 JDK 17 直接显示为已安装。

## 9. 已知限制

**① 已打开的终端不会更新。** 进程环境在启动时继承，Windows 没有全局刷新机制。
切换后必须新开终端验证。

**② 防火墙按可执行文件完整路径匹配。** 通过 junction 启动的 `node.exe`，
上报路径是 `links\node\node.exe`，与真实安装路径不同。
按真实路径写的防火墙放行规则会失效，表现为「本机访问正常、局域网设备访问失败」。
建议按**端口**放行，或为 `links\node\node.exe` 单独加规则。

**③ 防火墙弹窗不能乱关。** 取消弹窗会写入永久 Block 规则（`TCP Query User{...}`），
之后防火墙 UI 的允许按钮会变灰，只能命令行删除。

**④ 未代码签名。** SmartScreen 会提示，杀毒软件可能误报。

## 10. 界面

- 标题栏自绘，`-webkit-app-region: drag` 实现拖拽，窗口控制按钮单独处理。
- `show: false` + `ready-to-show`，避免白屏闪烁。
- 切页不用整页 opacity 过渡，改为元素级 `translateY(6px) → 0`、25 ms 错峰，
  各页面绝对定位重叠，避免闪烁。
- 设计令牌集中在 `src/style.css`，遵循 Fluent 2 的圆角、分层与缓动曲线。
