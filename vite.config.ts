import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  // Honour an assigned PORT. Vite otherwise pins 5173 and quietly walks to the
  // next free port, which leaves whoever launched it pointing at the wrong one.
  server: { port: Number(process.env.PORT) || 5173 },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
