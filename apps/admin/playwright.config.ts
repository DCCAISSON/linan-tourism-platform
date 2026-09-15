import { defineConfig, devices } from "@playwright/test"

const externalBaseUrl = process.env["PLAYWRIGHT_BASE_URL"]
const baseURL = externalBaseUrl ?? "http://127.0.0.1:5174"

export default defineConfig({
  testDir: "./e2e",
  ...(externalBaseUrl === undefined
    ? {
        webServer: {
          command: "corepack pnpm dev --host 127.0.0.1 --port 5174",
          url: baseURL,
          reuseExistingServer: !process.env["CI"],
        },
      }
    : {}),
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
