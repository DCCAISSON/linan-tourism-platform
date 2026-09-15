import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "corepack pnpm dev --host 127.0.0.1 --port 5174",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: !process.env["CI"],
  },
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
