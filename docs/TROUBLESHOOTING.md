# 常见问题排查

按「你会看到什么」来组织。每条都给出判断依据和具体命令，不是「重启试试」。

---

## 1. 切了版本，终端里还是旧的

**判断**：`java -version` / `node -v` 显示的版本和你点选的不一致。

**九成原因是终端没重开。** 进程在启动时继承环境变量，之后系统怎么改都不会影响已经在跑的
进程。这不是工具的问题，Windows 上任何方案都一样。

```powershell
# 需要重开：cmd、PowerShell、Windows Terminal 的所有标签、IDE 的内置终端
# VS Code / IDEA 还有一个额外情况：它们继承了启动它时的环境
```

重开还是旧版本，按顺序查：

```powershell
# 1) 联接指向谁（应当是你要的版本）
Get-Item "$env:LOCALAPPDATA\JavaDevTool\links\jdk" | Select-Object LinkType, Target
Get-Item "$env:LOCALAPPDATA\JavaDevTool\links\node" | Select-Object LinkType, Target

# 2) JAVA_HOME 是否指向联接
$env:JAVA_HOME      # 应为 ...\JavaDevTool\links\jdk

# 3) Path 里谁排在前面（node 常见：前面还有别的 node 目录）
$env:PATH -split ';' | Where-Object { $_ -match 'node|JavaDevTool' }

# 4) 到底解析到哪个可执行文件
where.exe node
where.exe java
```

第 3 步是关键：**PATH 前面的目录优先级更高**。如果 `C:\Program Files\nodejs` 排在
`...\links\node` 前面，那么无论怎么切都还是它。把这行删掉，或用界面上的 PATH 编辑功能
调整顺序。

---

## 2. 防火墙弹窗点错了，允许按钮变灰

**判断**：程序第一次监听端口时 Windows 弹出防火墙提示，你点了「取消」或直接关掉。

Windows 会为该可执行文件写下一条**永久阻止规则**，此后系统防火墙界面里的「允许」复选框
会变成灰色，点不动——因为被阻止规则挡住了，而不是权限不足。

```powershell
# 先看有没有该程序的阻止规则
Get-NetFirewallRule -Direction Inbound |
  Where-Object { $_.DisplayName -like "*JunctionBox*" -or $_.DisplayName -like "*node*" } |
  Select-Object DisplayName, Action, Enabled, Profile

# 删掉阻止规则（名字里有 Query User / Block 的那种）
Remove-NetFirewallRule -DisplayName "TCP Query User{...} ..."

# 重新放行（不需要管理员以外的额外条件；Profile 用 any 避免只对专用网络生效）
New-NetFirewallRule -DisplayName "JunctionBox dev servers" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080,8081,3000,5173 `
  -Profile Any
```

**为什么建议 `-Profile Any`**：只勾「专用网络」时，如果当前 WiFi 被识别成「公用网络」，
规则不会生效，表现为本机能访问、手机不能访问。这是排查「局域网访问不了」时最常见的一层。

> 本机用 `localhost` 访问测不出防火墙问题——loopback 流量根本不经过防火墙。
> 必须用局域网 IP 从另一台设备测。

---

## 3. 联接损坏 / 手工删了 links 目录

**判断**：`Get-Item` 看不到 `links\jdk`，或指向一个已经不存在的目录；界面启动时报错。

程序**每次启动都会自愈**：重建被删除的联接、修掉 PATH 里失效的项。所以最简单的处理是
关掉程序再打开。

仍然不行时手工检查：

```powershell
$links = "$env:LOCALAPPDATA\JavaDevTool\links"
Get-ChildItem $links -Force | Select-Object Name, LinkType, Target

# 指向的目标不存在了 → 在界面里重新选一个版本切换，会重建联接
```

**不要这样做**：在资源管理器里对 `links\jdk` 按 Delete 后再「清空回收站」。删除联接本身
是安全的（不会删真实目录），但用递归删除工具（`rmdir /s`、`Remove-Item -Recurse`）作用在
联接上，某些工具会顺着联接删进真实目录。用 `fs.rmdirSync` 或
`[IO.Directory]::Delete($path, $false)` 只删联接。

---

## 4. 界面白屏 / 花屏 / 黑块

**判断**：窗口能打开但内容不渲染，或 Mica 材质区域出现色块。

这是 GPU 合成层的问题，常见于旧显卡驱动、远程桌面、虚拟机。程序检测到连续 GPU 崩溃后
会自动降级为软件渲染，重启一次即可。

仍然白屏时，跳过自检强制软件渲染：

```powershell
# 便携版
.\JunctionBox-Portable-x64.exe --disable-gpu
```

窗口透明或 Mica 异常（Windows 10 早期版本）：

```powershell
.\JunctionBox-Portable-x64.exe --disable-gpu-compositing
```

---

## 5. SmartScreen 蓝色提示 / 杀毒软件报毒

未购买代码签名证书的 Electron 程序，首次运行必然出现 SmartScreen 提示，这是微软对
「无签名的新下载文件」的标准策略，不代表文件有问题。

- 「更多信息 → 仍要运行」继续；
- 或校验文件完整性：下载 `SHA256SUMS.txt`，`certutil -hashfile <文件> SHA256` 比对；
- 或直接 `npm run dist` 自己构建，产物就是你自己的。

杀软报毒同理，Electron 打包的程序常被启发式引擎误判。加白名单即可。

---

## 6. 端口扫描看不到某个进程

**判断**：`netstat -ano` 在命令行能看到，程序列表里没有。

两个原因：

1. **权限**。别的用户（含 SYSTEM 服务）起的进程，读不到进程名。以管理员身份运行程序即可看到完整信息。
2. **UDP 端口**。默认扫的是 TCP 监听端口，UDP 需要单独筛选。

结束进程失败时，通常是目标进程有保护（系统服务、杀软自身）或需要提权。
命令行兜底：

```powershell
# 按端口找 PID（和程序内部一样的思路）
Get-NetTCPConnection -LocalPort 8080 -State Listen | Select-Object OwningProcess

# 看它到底在跑什么
Get-CimInstance Win32_Process -Filter "ProcessId=12345" | Select-Object Name, CommandLine

# 结束
Stop-Process -Id 12345 -Force
```

---

## 7. 卸载后还有残留

| 残留 | 位置 | 能不能删 |
|---|---|---|
| 便携版本体 | 你放 exe 的位置 | 直接删文件即可 |
| 联接与运行时 | `%LOCALAPPDATA%\JavaDevTool\` | 可删，但里面的 runtimes 是你装的 JDK / Node |
| 配置与台账 | `%APPDATA%\JavaDevTool\` | 可删，删后需重新登记扫描路径 |
| 环境变量 | `JAVA_HOME`、`Path` 里的两条 | 需手工清理，指向已删除联接的项会自动失效 |

卸载程序**不会**自动删除运行时和配置——那可能是你唯一的 JDK。要彻底清空：

```powershell
Remove-Item "$env:LOCALAPPDATA\JavaDevTool" -Recurse -Force   # 含已安装的运行时，慎用
Remove-Item "$env:APPDATA\JavaDevTool" -Recurse -Force        # 含配置与台账
# 然后手工删掉 JAVA_HOME 与 Path 里的相关条目
```

---

## 8. 换机器 / 迁移配置

程序的配置只有三个 JSON / 文本文件，直接拷走即可：

```
%APPDATA%\JavaDevTool\
├─ roots.json        安装位置
├─ paths.txt         手工登记的 JDK 目录
└─ node_paths.txt    手工登记的 Node 目录
```

`installed.json`（安装台账）建议**不要**跨机器拷贝：里面的绝对路径在新机器上不存在，
即使存在也不该被当成「本程序安装的」来允许删除。到新机器重新装一次版本即可。

---

## 还是没解决

带这几样信息提 Issue，能省掉一轮来回：

1. 程序版本（界面右下角 / 关于页）；
2. `Get-Item "$env:LOCALAPPDATA\JavaDevTool\links\jdk" | Select-Object LinkType, Target` 的输出；
3. `where.exe java` 与 `where.exe node` 的输出；
4. 复现步骤与报错原文。

[提交 Issue](https://github.com/LargeAkon/JunctionBox/issues/new/choose)
