import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: "./",
  server: { port: 5178, strictPort: true },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome120",
    assetsInlineLimit: 8192,
  },
});
