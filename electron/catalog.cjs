"use strict";
/**
 * 内置运行时版本目录
 * ============================================================
 * 这里只存「元数据 + 下载地址」，不存二进制。
 * 原因：一个 JDK 约 190MB、一个 Node 约 35MB，全部塞进 exe 会让安装包从 108MB
 * 涨到 500MB 以上，且每次发版都要重传。nvm / fnm / sdkman 全都采用「清单 + 按需下载」。
 *
 * 每个条目按 sources 顺序尝试，第一个失败自动换下一个：
 *   JDK  —— Azul CDN（实测 5MB/s）→ 清华 Temurin 镜像
 *   Node —— npmmirror（实测 9MB/s）→ 清华镜像 → 官方源
 *
 * 更新方式：`npm run catalog:update` 会从 Azul API 与 npmmirror 索引重新生成本文件。
 * 也可以手工改，只要保证 url 里的文件名真实存在。
 */

const JDK = [
  {
    id: "jdk-8",
    kind: "jdk",
    feature: 8,
    label: "JDK 8",
    ver: "8.0.512",
    vendor: "Azul Zulu",
    tag: "Legacy",
    sizeMb: 104,
    sources: [
      "https://cdn.azul.com/zulu/bin/zulu8.98.0.107-ca-jdk8.0.512-win_x64.zip",
      "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/8/jdk/x64/windows/OpenJDK8U-jdk_x64_windows_hotspot_8u504b01.zip",
    ],
  },
  {
    id: "jdk-11",
    kind: "jdk",
    feature: 11,
    label: "JDK 11",
    ver: "11.0.33",
    vendor: "Azul Zulu",
    tag: "LTS",
    sizeMb: 189,
    sources: [
      "https://cdn.azul.com/zulu/bin/zulu11.92.109-ca-jdk11.0.33-win_x64.zip",
      "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/11/jdk/x64/windows/OpenJDK11U-jdk_x64_windows_hotspot_11.0.32.1_1.zip",
    ],
  },
  {
    id: "jdk-17",
    kind: "jdk",
    feature: 17,
    label: "JDK 17",
    ver: "17.0.21",
    vendor: "Azul Zulu",
    tag: "LTS",
    sizeMb: 187,
    sources: [
      "https://cdn.azul.com/zulu/bin/zulu17.70.113-ca-jdk17.0.21.0.3-win_x64.zip",
      "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jdk/x64/windows/OpenJDK17U-jdk_x64_windows_hotspot_17.0.20.1_1.zip",
    ],
  },
  {
    id: "jdk-21",
    kind: "jdk",
    feature: 21,
    label: "JDK 21",
    ver: "21.0.13",
    vendor: "Azul Zulu",
    tag: "LTS",
    sizeMb: 201,
    sources: [
      "https://cdn.azul.com/zulu/bin/zulu21.54.109-ca-jdk21.0.13.0.3-win_x64.zip",
      "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jdk/x64/windows/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip",
    ],
  },
  {
    id: "jdk-25",
    kind: "jdk",
    feature: 25,
    label: "JDK 25",
    ver: "25.0.5",
    vendor: "Azul Zulu",
    tag: "LTS",
    sizeMb: 220,
    sources: [
      "https://cdn.azul.com/zulu/bin/zulu25.38.109-ca-jdk25.0.5.0.3-win_x64.zip",
      "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/25/jdk/x64/windows/OpenJDK25U-jdk_x64_windows_hotspot_25.0.5_8.zip",
    ],
  },
];

function nodeItem(ver, lts, sizeMb) {
  return {
    id: "node-" + ver.split(".")[0],
    kind: "node",
    feature: Number(ver.split(".")[0]),
    label: "Node " + ver.split(".")[0],
    ver,
    vendor: "Node.js",
    tag: lts,
    sizeMb: sizeMb || 0,
    sources: [
      `https://npmmirror.com/mirrors/node/v${ver}/node-v${ver}-win-x64.zip`,
      `https://mirrors.tuna.tsinghua.edu.cn/nodejs-release/v${ver}/node-v${ver}-win-x64.zip`,
      `https://nodejs.org/dist/v${ver}/node-v${ver}-win-x64.zip`,
    ],
  };
}

const NODE = [
  nodeItem("20.20.2", "Iron", 29),
  nodeItem("22.23.4", "Jod", 34),
  nodeItem("24.22.2", "Krypton", 36),
  nodeItem("26.13.0", "Lithium", 39),
];

const ALL = [...JDK, ...NODE];

/** 按 kind 返回该类型的完整目录（保持声明顺序：新版本在下） */
function list(kind) {
  return (kind === "jdk" ? JDK : NODE).map((it) => ({ ...it }));
}

function find(kind, id) {
  return ALL.find((it) => it.kind === kind && it.id === id) || null;
}

module.exports = { list, find, JDK, NODE };
