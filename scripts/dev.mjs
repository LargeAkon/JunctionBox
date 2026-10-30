import { createServer } from "vite";
import { spawn } from "node:child_process";
import electronPath from "electron";

const server = await createServer();
await server.listen();

const { port } = server.config.server;
const url = `http://localhost:${port}`;
server.printUrls();

// 编辑器、Electron 应用内终端等宿主可能注入 ELECTRON_RUN_AS_NODE=1。
// 它会让 Electron 以纯 Node 模式启动，表现是 app 为 undefined 后立即崩溃。
const env = { ...process.env, VITE_DEV_SERVER_URL: url };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ["."], { stdio: "inherit", env });

child.on("close", async () => {
  await server.close();
  process.exit(0);
});
