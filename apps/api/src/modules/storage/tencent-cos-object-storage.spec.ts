import { describe, expect, it } from "vitest"
import {
  CosStorageConfigurationError,
  parseTencentCosStorageConfiguration,
} from "./tencent-cos-object-storage.js"

describe("parseTencentCosStorageConfiguration", () => {
  it("returns the COS connection settings when every required variable is present", () => {
    // Given
    const environment = {
      TENCENT_CLOUD_REGION: "ap-shanghai",
      TENCENT_CLOUD_COS_BUCKET: "linantravel-test-1488582402",
      TENCENT_CLOUD_SECRET_ID: "test-secret-id",
      TENCENT_CLOUD_SECRET_KEY: "test-secret-key",
    }

    // When
    const configuration = parseTencentCosStorageConfiguration(environment)

    // Then
    expect(configuration).toEqual({
      bucket: "linantravel-test-1488582402",
      region: "ap-shanghai",
      secretId: "test-secret-id",
      secretKey: "test-secret-key",
    })
  })

  it("identifies the missing variable without exposing another credential", () => {
    // Given
    const environment = {
      TENCENT_CLOUD_REGION: "ap-shanghai",
      TENCENT_CLOUD_COS_BUCKET: "linantravel-test-1488582402",
      TENCENT_CLOUD_SECRET_ID: "test-secret-id",
      TENCENT_CLOUD_SECRET_KEY: "",
    }

    // When
    const parse = () => parseTencentCosStorageConfiguration(environment)

    // Then
    expect(parse).toThrowError(new CosStorageConfigurationError("TENCENT_CLOUD_SECRET_KEY"))
  })
})
