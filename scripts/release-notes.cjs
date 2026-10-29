#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 抽取某个版本的段落，生成 GitHub Release 说明。
 *
 * 为什么要这个脚本：Release 说明以前一半是手写、一半是 GitHub 自动生成的
 * "Full Changelog" 链接，风格和长度全不一样。现在 CHANGELOG 是唯一来源，
 * Release 页只是它的一份渲染结果，加一个统一的下载尾巴。
 *
 * 用法：
 *   node scripts/release-notes.cjs 4.1.1                 # 输出到 stdout
 *   node scripts/release-notes.cjs v4.1.1 --out notes.md # 写入文件
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const REPO = process.env.GITHUB_REPOSITORY || "LargeAkon/JunctionBox";
const SITE = `https://github.com/${REPO}`;

const argv = process.argv.slice(2);
const versionArg = argv.find((a) => !a.startsWith("--"));
const outIdx = argv.indexOf("--out");
const outFile = outIdx >= 0 ? argv[outIdx + 1] : "";

if (!versionArg) {
  console.error("用法: node scripts/release-notes.cjs <版本号> [--out 文件]");
  process.exit(1);
}

const version = versionArg.replace(/^v/i, "");

/** 找到 "## [4.1.1] - 日期 · 主题" 这一段，返回 { theme, body } */
function extract(md, ver) {
  const lines = md.split(/\r?\n/);
  const esc = ver.replace(/\./g, "\\.");
  const head = new RegExp(`^##\\s+\\[?v?${esc}\\]?\\s*[-—]?\\s*(.*)$`);
  let start = -1;
  let theme = "";
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(head);
    if (m && lines[i].startsWith("## ")) {
      start = i;
      // 标题形如 "## [4.1.1] - 2026-10-29 · 删除版本前先确认"
      const raw = m[1] || "";
      const cut = raw.split("·");
      theme = cut.length > 1 ? cut.slice(1).join("·").trim() : "";
      break;
    }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const body = lines
    .slice(start + 1, end)
    .join("\n")
    .replace(/^\s*---\s*$/gm, "")
    .trim();
  return { theme, body };
}

const footer = (ver) => `
---

### 下载

| 文件 | 类型 | 说明 |
|---|---|---|
| \`JunctionBox-Portable-x64.exe\` | 便携版 | 单文件，双击即用，删除文件即卸载 |
| \`JunctionBox-Setup-x64.exe\` | 安装包 | 开始菜单项、桌面快捷方式、自选安装目录 |

Windows 10 / 11，x64。**切换版本不需要管理员权限，不写系统目录。**

- 校验：下载 \`SHA256SUMS.txt\`，用 \`certutil -hashfile <文件> SHA256\` 比对。
- 未购买代码签名证书，首次运行可能出现 SmartScreen 提示，点「更多信息 → 仍要运行」。
- 从旧版本升级：直接覆盖安装即可，已配置的联接与扫描路径不受影响。

完整更新日志：${SITE}/blob/main/CHANGELOG.md · 全部版本：${SITE}/releases`;

const md = fs.readFileSync(CHANGELOG, "utf8");
const hit = extract(md, version);

let out;
if (!hit) {
  // 文档漏写不该堵住发版，但要明确告诉人这里缺东西
  console.warn(`[release-notes] CHANGELOG.md 中没有 ${version} 的段落，输出占位说明`);
  out = `本版本的详细变更尚未写入 \`CHANGELOG.md\`。\n${footer(version)}\n`;
} else {
  // 标题已经由 release 的 name（vX.Y.Z）承担，正文不再重复版本号，只留主题
  const lead = hit.theme ? `**${hit.theme}**\n\n` : "";
  out = `${lead}${hit.body}\n${footer(version)}\n`;
}

if (outFile) {
  fs.writeFileSync(path.resolve(ROOT, outFile), out, "utf8");
  console.log(`[release-notes] v${version} → ${outFile} (${out.length} 字符)`);
} else {
  process.stdout.write(out);
}
