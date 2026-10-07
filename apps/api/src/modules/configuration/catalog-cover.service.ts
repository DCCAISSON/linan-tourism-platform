import { randomUUID } from "node:crypto"
import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common"
import { parseTencentCosStorageConfiguration, TencentCosObjectStorage } from "../storage/tencent-cos-object-storage.js"
import type { CatalogCoverFile, CatalogCoverUpload } from "./catalog-cover.parser.js"

@Injectable()
export class CatalogCoverService {
  private client: TencentCosObjectStorage | null = null

  async upload(input: CatalogCoverUpload): Promise<{ readonly path: string }> {
    const key = `catalog-covers/${randomUUID()}.${input.extension}`
    try {
      await this.storage().putObject({ key, body: input.body, contentType: input.contentType })
    } catch (error) {
      if (error instanceof Error || (typeof error === "object" && error !== null)) {
        throw new ServiceUnavailableException({ code: "catalog_cover_storage_unavailable", message: "封面图片暂时无法上传，请稍后重试" })
      }
      throw error
    }
    return { path: `/${key}` }
  }

  async content(file: CatalogCoverFile): Promise<Buffer> {
    try {
      return await this.storage().getObject(`catalog-covers/${file.filename}`)
    } catch (error) {
      if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 404) {
        throw new NotFoundException({ code: "catalog_cover_not_found", message: "封面图片不存在" })
      }
      if (error instanceof Error || (typeof error === "object" && error !== null)) {
        throw new ServiceUnavailableException({ code: "catalog_cover_storage_unavailable", message: "封面图片暂时无法读取，请稍后重试" })
      }
      throw error
    }
  }

  private storage(): TencentCosObjectStorage {
    this.client ??= new TencentCosObjectStorage(parseTencentCosStorageConfiguration(process.env))
    return this.client
  }
}
