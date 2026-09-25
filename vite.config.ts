import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Keep fonts and small images cacheable and compatible with the strict CSP.
  build: { assetsInlineLimit: 0 },
  server: { proxy: { "/api": "http://127.0.0.1:4188" } },
});
