import { createServer } from "vite";
import { spawn } from "node:child_process";
import electronPath from "electron";

const server = await createServer();
await server.listen();

const { port } = server.config.server;
const url = `http://localhost:${port}`;
server.printUrls();

const child = spawn(electronPath, ["."], {
  stdio: "inherit",
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

child.on("close", async () => {
  await server.close();
  process.exit(0);
});
