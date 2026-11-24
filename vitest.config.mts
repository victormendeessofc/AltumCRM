import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    hookTimeout: 60_000, // cada arquivo de teste do banco sobe um Postgres embutido; em paralelo isso passa de 10 s
    include: ["src/**/*.test.{ts,tsx}", "supabase/tests/**/*.test.ts"],
  },
});
