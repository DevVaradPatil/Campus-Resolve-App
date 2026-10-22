import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside the React server runtime; tests import server modules directly.
      "server-only": fileURLToPath(new URL("./tests/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    env: {
      NEXT_PUBLIC_USE_EMULATORS: "true",
      FIREBASE_PROJECT_ID: "demo-campusresolve",
      CRON_SECRET: "test-cron-secret-0123456789abcdefghij",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-campusresolve",
    },
  },
});
