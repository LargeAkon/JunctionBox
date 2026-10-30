"use strict";
/**
 * 不需要界面的回归自检（npm test）
 * ============================================================
 * 这些都是「错了会毁掉用户环境」的纯逻辑，值得每次都跑一遍：
 *   - PATH 重建：去重、剔除旧的 JDK bin、字面量 %JAVA_HOME%\bin 只出现一次
 *   - PATH 长度闸门
 *   - 联接切换：只动链接本身，绝不碰它指向的真实目录
 *   - 删除保护：不是本程序装的目录一律拒绝
 *   - 版本号归一化
 *
 * 只在临时目录里操作，不接触真实 JDK / Node。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const core = require("../electron/core.cjs");
const installer = require("../electron/installer.cjs");

let pass = 0;
let fail = 0;
const ok = (cond, name, extra) => {
  if (cond) {
    pass++;
    console.log("  ok   " + name);
  } else {
    fail++;
    console.log("  FAIL " + name + (extra ? "  → " + extra : ""));
  }
};
const eq = (a, b, name) => ok(a === b, name, `期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`);

// ---------------------------------------------------------------- PATH
console.log("\n[PATH 重建]");
{
  const out = core.rebuildJdkPath("C:\\a;%JAVA_HOME%\\bin;c:\\A;C:\\b", "", true);
  eq(out, "%JAVA_HOME%\\bin;C:\\a;C:\\b", "字面量 %JAVA_HOME%\\bin 只出现一次，且大小写重复项被合并");

  const out2 = core.rebuildJdkPath("%JAVA_HOME%\\bin;C:\\x", "D:\\jdk17", false);
  eq(out2, "C:\\x", "机器级重建时丢弃 %JAVA_HOME%\\bin（该变量随后会被删）");

  const out3 = core.rebuildJdkPath("C:\\a;C:\\a;C:\\a", "", true);
  eq(out3, "%JAVA_HOME%\\bin;C:\\a", "连续重复项被合并");
}
{
  const out = core.rebuildNodePath("C:\\x;C:\\x;%USERPROFILE%\\AppData\\Roaming\\npm", "");
  eq(out, "C:\\x;%USERPROFILE%\\AppData\\Roaming\\npm", "Node 路径去重");
}
{
  ok(core.checkPathSize("a".repeat(29999)) === null, "29999 字符通过");
  ok(typeof core.checkPathSize("a".repeat(30001)) === "string", "30001 字符被拒绝");
}

// ---------------------------------------------------------------- 联接
console.log("\n[联接切换]");
{
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "jbox_test_"));
  const t1 = path.join(base, "jdk-a");
  const t2 = path.join(base, "jdk-b");
  const link = path.join(base, "current");
  for (const d of [t1, t2]) {
    fs.mkdirSync(path.join(d, "bin"), { recursive: true });
    fs.writeFileSync(path.join(d, "bin", "java.exe"), "x");
  }
  fs.writeFileSync(path.join(t1, "sentinel-a.txt"), "keep me");
  fs.writeFileSync(path.join(t2, "sentinel-b.txt"), "keep me");

  ok(core.makeLink(link, t1) === true, "创建联接成功");
  ok(core.isLink(link), "是一个联接");
  eq(path.normalize(core.linkTarget(link)).toLowerCase(), t1.toLowerCase(), "指向 jdk-a");

  ok(core.makeLink(link, t2) === true, "改指 jdk-b 成功");
  eq(path.normalize(core.linkTarget(link)).toLowerCase(), t2.toLowerCase(), "现在指向 jdk-b");
  ok(fs.existsSync(path.join(t1, "sentinel-a.txt")), "切换后原来的 jdk-a 内容完好（没有被顺着删掉）");
  ok(!fs.existsSync(path.join(base, "current.new")), "临时的 .new 联接没有残留");

  ok(core.dropLink(link) === true, "摘掉联接");
  ok(!fs.existsSync(link), "联接本身已删除");
  ok(fs.existsSync(path.join(t2, "sentinel-b.txt")), "摘联接不会删到目标目录");
  ok(core.makeLink(link, path.join(base, "no-such")) === false, "目标不存在时拒绝创建");

  fs.rmSync(base, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 删除保护
console.log("\n[删除保护]");
{
  const r = installer.uninstall("jdk", "E:\\develop\\Java\\jdk");
  ok(r.ok === false, "用户自己的 JDK 目录被拒绝删除");
  ok(installer.isManaged("jdk", "E:\\develop\\Java\\jdk") === false, "用户目录不算受管");
}

// ---------------------------------------------------------------- 安装位置
console.log("\n[安装位置校验]");
{
  ok(installer.checkRoot("jdk", "").ok === false, "空路径被拒绝");
  ok(installer.checkRoot("jdk", "relative\\dir").ok === false, "相对路径被拒绝");
  ok(installer.checkRoot("jdk", "E:\\").ok === false, "盘符根被拒绝");
  // 用挂不上的 Z: 盘构造，避免依赖本机真实安装位置（rootOf 会随配置变化）
  const dirs = ["Z:\\dev\\Java\\jdk", "Z:\\dev\\Java\\jdk8", "C:\\Users\\x\\AppData\\Local\\JavaDevTool\\runtimes\\jdk\\z"];
  const sug = installer.suggestRoot("jdk", dirs);
  eq(sug.root, "Z:\\dev\\Java", "从已有版本反推出父目录");
  eq(sug.count, 2, "AppData 里的自建版本不计入习惯");
}

// ---------------------------------------------------------------- 版本号
console.log("\n[版本号归一化]");
{
  eq(installer.normJavaVersion("1.8.0_504"), "8.0.504", "1.8.0_504 → 8.0.504");
  eq(installer.normJavaVersion("21.0.13.0.3"), "21.0.13", "去掉 Azul 的第四段");
  eq(installer.brandOf("Azul Systems, Inc."), "zulu", "厂商名归一化");
}

// ---------------------------------------------------------------- 进程
console.log("\n[进程结束的边界]");
(async () => {
  ok((await core.killProcess(0)).ok === false, "拒绝 PID 0");
  ok((await core.killProcess(4)).ok === false, "拒绝 PID 4");
  ok((await core.killProcess(process.pid)).ok === false, "拒绝结束自己");
  ok((await core.killProcess("abc")).ok === false, "拒绝非数字");

  console.log(`\n${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
