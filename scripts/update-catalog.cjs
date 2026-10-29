#!/usr/bin/env node
/**
 * 重新生成 electron/catalog.cjs
 * ============================================================
 * 内置清单会随上游发版而过期（Temurin 每季度、Node 每月）。这个脚本从
 * 两个公开接口拉当前 GA 版本，重新生成清单，避免手工核对 URL 出错。
 *
 *   npm run catalog:update
 *
 * 数据来源：
 *   JDK  —— Azul Metadata API（同时也给出 CDN 直链）
 *   Node —— npmmirror 的 index.json（与官方 index 同构）
 * 备用源（清华 Temurin）的版本号需要人工确认后更新；脚本会保留已有的备用源，
 * 只有当大版本不存在时才补空数组。
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const UA = "JunctionBox-catalog-updater";
const JDK_FEATURES = [8, 11, 17, 21, 25];

function getJson(url) {
  return new Promise((resolve, reject) => {
    const go = (u, depth) => {
      https
        .get(u, { headers: { "User-Agent": UA, Accept: "application/json" } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            if (depth > 5) return reject(new Error("重定向过多"));
            return go(res.headers.location, depth + 1);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error("HTTP " + res.statusCode + " " + u));
          }
          let s = "";
          res.setEncoding("utf8");
          res.on("data", (d) => (s += d));
          res.on("end", () => {
            try {
              resolve(JSON.parse(s));
            } catch (e) {
              reject(e);
            }
          });
        })
        .on("error", reject);
    };
    go(url, 0);
  });
}

/**
 * Azul 的 distro_version 是它自己的构建号（17.70.113），不是 Java 版本。
 * 真正的 Java 版本在包名里：zulu17.70.113-ca-jdk17.0.21.0.3-win_x64.zip → 17.0.21
 */
function azulVer(name, javaVersion) {
  const m = /jdk(\d+\.\d+\.\d+)/.exec(name || "");
  if (m) return m[1];
  const a = (javaVersion || []).slice(0, 3).join(".");
  return a.replace(/\.0$/, "");
}

/** 只取响应头里的 content-length，用于给界面显示「下载约 xxx MB」 */
function headSize(url) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(0), 6000);
    const go = (u, depth) => {
      const req = https.get(u, { headers: { "User-Agent": UA }, timeout: 6000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 4) {
          res.resume();
          return go(res.headers.location, depth + 1);
        }
        const len = Number(res.headers["content-length"] || 0);
        res.resume();
        clearTimeout(timer);
        resolve(len ? Math.round(len / 1048576) : 0);
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => {
        clearTimeout(timer);
        resolve(0);
      });
    };
    go(url, 0);
  });
}

async function fetchJdk() {
  const out = [];
  for (const f of JDK_FEATURES) {
    const url =
      `https://api.azul.com/metadata/v1/zulu/packages/?java_version=${f}` +
      `&os=windows&arch=x64&java_package_type=jdk&archive_type=zip&latest=true&release_status=ga&page_size=1`;
    try {
      const j = await getJson(url);
      const p = j && j[0];
      if (!p) throw new Error("空结果");
      out.push({
        feature: f,
        ver: azulVer(p.name, p.java_version),
        url: p.download_url,
        sizeMb: await headSize(p.download_url),
      });
    } catch (e) {
      out.push({ feature: f, ver: "", url: "", sizeMb: 0, err: e.message });
    }
  }
  return out;
}

const majorOf = (v) => Number(String(v).replace(/^v/, "").split(".")[0]);

/**
 * 只收「当前仍在维护的 LTS 线」：取最新 4 个大版本的 LTS。
 * 早期版本把 4.x / 6.x / 8.x 全收进来，清单会变成一屏 12 项。
 */
async function fetchNode() {
  const idx = await getJson("https://npmmirror.com/mirrors/node/index.json");
  const byMajor = new Map();
  for (const it of idx) {
    const major = majorOf(it.version);
    if (!major) continue;
    if (!byMajor.has(major)) byMajor.set(major, it); // index 按时间倒序，首个即最新
  }
  const lines = [...byMajor.values()]
    .filter((it) => it.lts)
    .sort((a, b) => majorOf(b.version) - majorOf(a.version))
    .slice(0, 4)
    .sort((a, b) => majorOf(a.version) - majorOf(b.version));

  return Promise.all(
    lines.map(async (it) => {
      const ver = it.version.replace(/^v/, "");
      const url = `https://npmmirror.com/mirrors/node/v${ver}/node-v${ver}-win-x64.zip`;
      return {
        major: majorOf(ver),
        ver,
        lts: typeof it.lts === "string" ? it.lts : "LTS",
        sizeMb: await headSize(url),
      };
    })
  );
}

const LTS_TAG = (f) => (f === 8 ? "Legacy" : "LTS");

(async () => {
  const file = path.join(__dirname, "..", "electron", "catalog.cjs");
  const old = fs.readFileSync(file, "utf8");

  // 保留手工维护的备用源（清华 Temurin 的文件名无法从公开接口稳定推导）
  const fallback = {};
  for (const m of old.matchAll(/"(https:\/\/mirrors\.tuna\.tsinghua\.edu\.cn\/Adoptium\/[^"]+)"/g)) {
    const feature = /Adoptium\/(\d+)\//.exec(m[1])[1];
    fallback[feature] = m[1];
  }

  const jdks = await fetchJdk();
  const nodes = await fetchNode();

  const jdkSrc = jdks
    .filter((j) => j.url)
    .map(
      (j) => `  {
    id: "jdk-${j.feature}",
    kind: "jdk",
    feature: ${j.feature},
    label: "JDK ${j.feature}",
    ver: "${j.ver}",
    vendor: "Azul Zulu",
    tag: "${LTS_TAG(j.feature)}",
    sizeMb: ${j.sizeMb || 0},
    sources: [
      "${j.url}"${fallback[j.feature] ? `,\n      "${fallback[j.feature]}"` : ""},
    ],
  },`
    )
    .join("\n");

  const nodeSrc = nodes
    .map(
      (n) => `  nodeItem("${n.ver}", "${n.lts}", ${n.sizeMb || 0}),`
    )
    .join("\n");

  // 只替换数据区，保留文件头的说明与导出逻辑
  const next = old
    .replace(/(const JDK = \[\n)[\s\S]*?(\n\];)/, `$1${jdkSrc}$2`)
    .replace(/(const NODE = \[\n)[\s\S]*?(\n\];)/, `$1${nodeSrc}$2`);

  fs.writeFileSync(file, next, "utf8");
  console.log("catalog.cjs 已更新");
  console.log("JDK :", jdks.map((j) => `${j.feature}->${j.ver || j.err}`).join("  "));
  console.log("Node:", nodes.map((n) => n.ver).join("  "));
})();
