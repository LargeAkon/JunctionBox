# 版本库

版本库是 v4.0.0 起内置的功能：不用离开程序，就能下载、解压、切换一个 JDK 或 Node.js。
本文写它的完整机制——清单怎么来、装到哪、怎么删、出问题怎么查。

[README](../README.md)（[中文](../README.zh-CN.md)）只讲「怎么用」，这里讲「为什么是这样」。

---

## 1. 清单：只有元数据，没有二进制

清单定义在 [`electron/catalog.cjs`](../electron/catalog.cjs)，每个条目长这样：

```js
{
  id: "jdk-21",
  kind: "jdk",
  feature: 21,              // 大版本，界面据此判断「是否已装过同类」
  label: "JDK 21",
  ver: "21.0.13",
  vendor: "Azul Zulu",
  tag: "LTS",
  sizeMb: 201,              // 只用于界面预告，不参与校验
  sources: [                // 顺序尝试，前一个失败自动换下一个
    "https://cdn.azul.com/zulu/bin/zulu21.54.109-ca-jdk21.0.13.0.3-win_x64.zip",
    "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jdk/x64/windows/..."
  ]
}
```

当前清单（`npm run catalog:update` 生成）：

| 类型 | 版本 | 来源 |
|---|---|---|
| JDK | 8、11、17、21、25 | Azul Zulu → 清华 Adoptium 镜像 |
| Node.js | 20、22、24、26 | npmmirror → 清华 → nodejs.org |

**为什么不把二进制打进安装包。** 一个 JDK 压缩后约 190 MB，九个运行时全内置会让每个
Release 从 108 MB 涨到 600 MB 以上，而且用户只能拿到打包时的那个版本。nvm、fnm、sdkman
都用「清单 + 按需下载」，原因相同。

**更新清单**：

```bash
npm run catalog:update     # 读 Azul 元数据接口与 npmmirror 索引，重写 catalog.cjs
```

脚本只取每个运行时最新的 4 个大版本，JDK 版本号从压缩包文件名正则提取
（Azul 的 `distro_version` 是构建号，不是语言版本）。

---

## 2. 安装位置

### 生效位置怎么决定

按优先级：

1. `%APPDATA%\JavaDevTool\roots.json` 里该类型的 `root`（界面点「更改」或确认安装时写入）；
2. `%APPDATA%\JavaDevTool\runtimes.txt` 首行的绝对路径（v4.0.0 的老做法，仍然兼容）；
3. 默认 `%LOCALAPPDATA%\JavaDevTool\runtimes\`。

`roots.json` 是**按类型分开**的，因为你很可能把 JDK 放 E 盘、Node 放 D 盘：

```json
{ "jdk": "E:\\develop\\Java", "node": "E:\\develop\\node\\versions" }
```

### 点「安装」时的推荐逻辑

`installer.suggestRoot()` 不是猜，是真去数：

1. 用当前扫描结果拿到所有已发现的 JDK / Node 路径；
2. 按**父目录**分组（`E:\develop\Java\jdk` 与 `E:\develop\Java\jdk8` → `E:\develop\Java`）；
3. 排除：程序自己的版本库目录、`AppData` 下任何位置、盘符根（`E:\`）、`Program Files`；
4. 按命中数量排序，数量相同则层级更深的优先；
5. 对候选目录实际写一个探针文件，确认可写才推荐。

所以你装了 3 个 JDK 在 `E:\develop\Java` 时，它会建议 `E:\develop\Java`，并显示
「检测到 3 个已有版本」。

### 目标目录的校验

下载**之前**就校验，失败在一秒内报出，不会下完 190 MB 才告诉你路径不对：

| 检查 | 拒绝的情况 |
|---|---|
| 绝对路径 | `develop\Java` 这种相对路径 |
| 非盘符根 | `E:\` |
| 不是运行时本身 | 直接指向 `E:\develop\Java\jdk`（会把 JDK 套进 JDK 里） |
| 可写 | 无权限目录、只读盘 |

---

## 3. 安装过程

```
下载（流式，可取消） → 校验字节数 → 解压到 .tmp_xxx → 确认 bin\java.exe 存在
                                                        ↓
                        正式目录 ← rename ← 通过校验
```

几个刻意的设计：

- **先临时后正式**：解压进 `.tmp_<id>_<时间戳>`，只有确认目标可执行文件存在才 rename 到
  正式位置。取消或失败不会在列表里留下半个 JDK。
- **临时目录不进列表**：扫描时跳过 `.tmp_` 前缀。
- **解压用系统 `tar.exe`**：Windows 10 1803+ 自带 bsdtar，实测解 190 MB 的包约 1 秒，
  比引入 JS 解压库更快也更省内存。
- **字节数校验**：下载完成后比对 `Content-Length`，截断的文件不会进入解压环节。
- **同名冲突**：目标目录已存在且**不是本程序装的**，不删除它，改为追加 `-2` 后缀。
- **异常清理**：进程被强杀时 `finally` 不执行，所以下次启动会清理超过 1 小时的 `.tmp_*`。

进度通过 `install:progress` 推给界面，包含阶段（download / extract / done / error）、
百分比、已传输字节、速率。同一时刻只允许一个安装任务，并发下载会互相抢带宽。

---

## 4. 安装台账与删除保护

这是 v4.1.0 起的核心安全机制。

**问题**：安装位置可以指向你自己的目录（`E:\develop\Java`），那里放着你自己的 JDK。
如果「删除」按钮按路径前缀判断，等于把删除权限对准了你的环境。

**做法**：`%APPDATA%\JavaDevTool\installed.json` 记录本程序亲手创建过的目录：

```json
{ "jdk": ["E:\\develop\\Java\\zulu-21.0.13"], "node": ["E:\\develop\\node\\versions\\v22.23.4"] }
```

删除按钮**只对台账里的目录显示**，`uninstall()` 也只认台账。此外还有三重拒绝：

1. 目录不在台账里 —— 拒绝（`该目录不是本程序安装的，为安全起见不会删除`）；
2. 目标是联接 —— 拒绝（避免顺藤摸瓜删掉真实目录）；
3. 目标是当前联接指向的版本 —— 拒绝（`该版本正在使用，请先切换到其他版本`）。

删除是 `fs.rmSync(recursive, force)` 的**物理删除，不进回收站，无法撤销**。
所以界面会先弹确认框，写明具体版本与目录。

---

## 5. 目录结构

```
%LOCALAPPDATA%\JavaDevTool\
├─ links\
│  ├─ jdk                     ← 联接，JAVA_HOME 指向这里
│  └─ node                    ← 联接，PATH 首项指向这里
└─ runtimes\                  ← 默认安装位置（可被 roots.json 覆盖）
   ├─ jdk\zulu-21.0.13\
   └─ node\v22.23.4\

%APPDATA%\JavaDevTool\
├─ roots.json                 ← 安装位置（按类型分开）
├─ installed.json             ← 安装台账
├─ paths.txt                  ← 手工登记的 JDK 扫描目录
├─ node_paths.txt             ← 手工登记的 Node 扫描目录
└─ runtimes.txt               ← 旧版安装位置配置（兼容保留）
```

目录名带版本后缀（`zulu-21.0.13`、`v22.23.4`），保证多个版本能共存于同一父目录。
数据目录沿用历史名称 `JavaDevTool` 而不是 `JunctionBox`：改名会让所有已存在的联接与
自定义扫描路径失效，代价远大于收益。

---

## 6. 不用界面也能装

版本发现是**运行时扫描**，没有注册表、没有索引文件。所以：

```powershell
# 手工解压一个 JDK 到任意已被扫描的目录，就会被识别
Expand-Archive zulu21.zip -DestinationPath E:\develop\Java\zulu-21.0.13
```

只要目录里有 `bin\java.exe`（Node 是 `node.exe`），刷新界面就能看到。
没有出现在扫描根里的目录，用界面上的「添加路径」登记一次即可。

反过来说：**别手工删除 `links` 目录下的联接**。要清理请切走版本，或直接重装程序——
启动自愈会重建联接，但需要你重新选一次版本。

---

## 7. 排查

| 现象 | 原因与处理 |
|---|---|
| 下载卡住不动 | 镜像无响应。取消后重试，会从 `sources` 的下一个地址开始 |
| 下载完成后报「压缩包结构异常」 | 镜像返回的是错误页而不是 zip。换一个镜像重试 |
| 删除失败，提示进程正在使用 | 有终端或 IDE 还开着该版本的 java / node。关掉后再删 |
| 装完列表里没有 | 安装位置不在扫描范围内。用「添加路径」登记，或点「恢复默认」 |
| 同一个大版本显示「已安装」 | 按大版本匹配，已有 17.0.11 时不会再让你下 17.0.21。切过去即可 |
| 安装位置选错、想改回来 | 版本库底部「更改」/「恢复默认」 |

镜像地址、清单字段的细节在 [`electron/catalog.cjs`](../electron/catalog.cjs) 顶部注释里；
下载与解压的实现见 [`electron/installer.cjs`](../electron/installer.cjs)。
