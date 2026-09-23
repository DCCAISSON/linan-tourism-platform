import { Injectable, ServiceUnavailableException } from "@nestjs/common"
import { CosStorageConfigurationError, parseTencentCosStorageConfiguration, TencentCosObjectStorage } from "../storage/tencent-cos-object-storage.js"
import type { PutCosObject } from "../storage/tencent-cos-object-storage.js"

@Injectable()
export class MediaStorageService {
  private client: TencentCosObjectStorage | null = null

  async putObject(input: PutCosObject): Promise<void> { await this.storage().putObject(input) }
  async getObject(key: string): Promise<Buffer> { return this.storage().getObject(key) }
  async deleteObject(key: string): Promise<void> { await this.storage().deleteObject(key) }

  private storage(): TencentCosObjectStorage {
    if (this.client !== null) return this.client
    try {
      this.client = new TencentCosObjectStorage(parseTencentCosStorageConfiguration(process.env))
      return this.client
    } catch (error) {
      if (error instanceof CosStorageConfigurationError) throw new ServiceUnavailableException({ code: "media_storage_unconfigured", message: "素材存储尚未配置" })
      throw error
    }
  }
}
