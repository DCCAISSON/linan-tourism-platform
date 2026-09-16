import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  parseTencentCosStorageConfiguration,
  TencentCosObjectStorage,
} from "../src/modules/storage/tencent-cos-object-storage.js"

const cosEnvironmentIsConfigured = [
  "TENCENT_CLOUD_REGION",
  "TENCENT_CLOUD_COS_BUCKET",
  "TENCENT_CLOUD_SECRET_ID",
  "TENCENT_CLOUD_SECRET_KEY",
].every((variableName) => (process.env[variableName]?.trim().length ?? 0) > 0)

describe.skipIf(!cosEnvironmentIsConfigured)("Tencent COS integration", () => {
  it("uploads, reads and removes a fictitious object with the configured CAM identity", async () => {
    // Given
    const storage = new TencentCosObjectStorage(parseTencentCosStorageConfiguration(process.env))
    const key = `integration-check/codex-${randomUUID()}.txt`
    const body = Buffer.from("linan-cos-integration-check", "utf8")
    let uploaded = false

    await storage.assertBucketAccess()

    try {
      // When
      await storage.putObject({ body, contentType: "text/plain; charset=utf-8", key })
      uploaded = true
      const downloaded = await storage.getObject(key)

      // Then
      expect(downloaded).toEqual(body)
    } finally {
      if (uploaded) {
        await storage.deleteObject(key)
      }
    }
  })
})
