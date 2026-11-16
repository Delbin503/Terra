import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { assetProxyPlugin } from "./tooling/vite/asset-proxy";

export default defineConfig({
  // The asset proxy streams Sigmawave Assets API files (GLB, HDR) same-origin:
  // their storage host sends no CORS header, so the browser can't fetch them.
  plugins: [react(), assetProxyPlugin()],
  // Honour an assigned PORT. Vite otherwise pins 5173 and quietly walks to the
  // next free port, which leaves whoever launched it pointing at the wrong one.
  server: { port: Number(process.env.PORT) || 5173 },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
