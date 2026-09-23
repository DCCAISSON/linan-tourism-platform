import { createHash, randomUUID } from "node:crypto"
import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common"
import type { MediaAsset, MediaCollection, MediaProvider, MediaSession } from "@linan/contracts"
import type { EntityManager } from "typeorm"
import { MediaAssetEntity } from "../../domain/entities/media-asset.entity.js"
import { MediaProviderEntity } from "../../domain/entities/media-provider.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { AuditLogEntity } from "../../domain/entities/audit-log.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import type { EnrollmentIdentity } from "../enrollment/enrollment.types.js"
import { MediaAccessService } from "./media-access.service.js"
import { MediaStorageService } from "./media-storage.service.js"
import type { MediaProviderInput, MediaUpload } from "./media.parser.js"

type FamilyMediaCollection = {
  readonly assets: readonly (MediaAsset & { readonly contentUrl: string })[]
  readonly providers: readonly MediaProvider[]
}

@Injectable()
export class MediaService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(MediaAccessService) private readonly access: MediaAccessService,
    @Inject(MediaStorageService) private readonly storage: MediaStorageService,
  ) {}

  async sessions(staff: StaffAccess): Promise<readonly MediaSession[]> {
    const source = await this.database.getDataSource()
    return (await this.access.sessions(source.manager, staff)).map(({ id, code }) => ({ id, code }))
  }

  async list(staff: StaffAccess, sessionId: string): Promise<MediaCollection> {
    const source = await this.database.getDataSource()
    await this.access.staffSession(source.manager, staff, sessionId, "media.read")
    const [assets, providers] = await Promise.all([
      source.manager.find(MediaAssetEntity, { where: { tourSessionId: sessionId }, order: { createdAt: "DESC" } }),
      source.manager.findBy(MediaProviderEntity, { tourSessionId: sessionId }),
    ])
    return { assets: assets.map(toMediaAsset), providers: providers.map(toMediaProvider) }
  }

  async upload(staff: StaffAccess, sessionId: string, input: MediaUpload): Promise<MediaAsset> {
    const source = await this.database.getDataSource()
    const session = await this.access.staffSession(source.manager, staff, sessionId, "media.upload")
    const contentHash = createHash("sha256").update(input.body).digest("hex")
    const asset = await source.transaction(async (manager) => {
      await manager.findOneOrFail(TourSessionEntity, { where: { id: sessionId }, lock: { mode: "pessimistic_write" } })
      const previous = await manager.findOneBy(MediaAssetEntity, { tourSessionId: sessionId, requestId: input.requestId })
      if (previous !== null) {
        if (previous.contentHash !== contentHash || previous.title !== input.title || previous.contentType !== input.contentType || previous.authorStaffId !== staff.actorId) throw conflict("上传编号已用于不同素材")
        return { row: previous, created: false }
      }
      const id = randomUUID()
      const row = manager.create(MediaAssetEntity, {
        id, tourSessionId: sessionId, authorStaffId: staff.actorId, requestId: input.requestId,
        contentHash, objectKey: `media/${sessionId}/${id}.${input.extension}`, title: input.title,
        kind: input.kind, contentType: input.contentType, byteSize: input.body.length,
      })
      await manager.save(row)
      await audit(manager, staff, session, { id, action: "media.upload_started" })
      return { row, created: true }
    })
    if (!asset.created) return toMediaAsset(asset.row)
    try {
      await this.storage.putObject({ body: input.body, contentType: input.contentType, key: asset.row.objectKey })
      asset.row.status = "draft"
      asset.row.version += 1
      await source.manager.save(asset.row)
    } catch (error) {
      asset.row.status = "failed"
      asset.row.version += 1
      try { await this.storage.deleteObject(asset.row.objectKey) }
      catch (cleanupError) {
        if (!(cleanupError instanceof Error)) throw cleanupError
        asset.row.cleanupPending = true
      }
      await source.manager.save(asset.row)
      if (!(error instanceof Error)) throw error
      throw new ServiceUnavailableException({ code: "media_upload_failed", message: asset.row.cleanupPending ? "上传失败，残留文件待清理；请在素材列表中删除该记录重试" : "上传失败，已清理文件；请刷新列表后重新选择上传" })
    }
    return toMediaAsset(asset.row)
  }

  async changeStatus(staff: StaffAccess, target: { readonly sessionId: string; readonly assetId: string }, input: { readonly expectedVersion: number; readonly status: "draft" | "published" }): Promise<MediaAsset> {
    const source = await this.database.getDataSource()
    const session = await this.access.staffSession(source.manager, staff, target.sessionId, "media.publish")
    return source.transaction(async (manager) => {
      const row = await lockedAsset(manager, target)
      assertVersion(row.version, input.expectedVersion)
      if (row.status !== "draft" && row.status !== "published") throw conflict("仅已上传成功的素材可发布或下架")
      if (row.status !== input.status) {
        row.status = input.status
        row.version += 1
        await manager.save(row)
        await audit(manager, staff, session, { id: row.id, action: input.status === "published" ? "media.published" : "media.unpublished" })
      }
      return toMediaAsset(row)
    })
  }

  async remove(staff: StaffAccess, target: { readonly sessionId: string; readonly assetId: string }, expectedVersion: number): Promise<{ readonly deleted: true }> {
    const source = await this.database.getDataSource()
    const session = await this.access.staffSession(source.manager, staff, target.sessionId, "media.delete")
    return source.transaction(async (manager) => {
      const row = await lockedAsset(manager, target)
      assertVersion(row.version, expectedVersion)
      if (row.status === "uploading") throw conflict("文件上传中，请稍后重试")
      if (row.status === "published") throw conflict("请先下架素材后再删除")
      try { await this.storage.deleteObject(row.objectKey) }
      catch (error) {
        if (!(error instanceof Error)) throw error
        throw new ServiceUnavailableException({ code: "media_delete_failed", message: "文件清理失败，记录已保留，请重试删除" })
      }
      await manager.delete(MediaAssetEntity, { id: row.id })
      await audit(manager, staff, session, { id: row.id, action: "media.deleted" })
      return { deleted: true }
    })
  }

  async content(staff: StaffAccess, sessionId: string, assetId: string): Promise<{ readonly asset: MediaAssetEntity; readonly body: Buffer }> {
    const source = await this.database.getDataSource()
    await this.access.staffSession(source.manager, staff, sessionId, "media.read")
    const asset = await source.manager.findOneBy(MediaAssetEntity, { id: assetId, tourSessionId: sessionId })
    if (asset === null || (asset.status !== "draft" && asset.status !== "published")) throw missing()
    return { asset, body: await this.storage.getObject(asset.objectKey) }
  }

  async familyList(identity: EnrollmentIdentity, orderId: string): Promise<FamilyMediaCollection> {
    const source = await this.database.getDataSource()
    const sessionId = await this.access.familySession(source.manager, identity, orderId)
    const [assets, providers] = await Promise.all([
      source.manager.find(MediaAssetEntity, { where: { tourSessionId: sessionId, status: "published" }, order: { createdAt: "DESC" } }),
      source.manager.findBy(MediaProviderEntity, { tourSessionId: sessionId, enabled: true }),
    ])
    return {
      assets: assets.map((asset) => ({ ...toMediaAsset(asset), contentUrl: this.storage.getSignedObjectUrl(asset.objectKey) })),
      providers: providers.map(toMediaProvider),
    }
  }

  async familyContent(identity: EnrollmentIdentity, orderId: string, assetId: string): Promise<{ readonly asset: MediaAssetEntity; readonly body: Buffer }> {
    const source = await this.database.getDataSource()
    const sessionId = await this.access.familySession(source.manager, identity, orderId)
    const asset = await source.manager.findOneBy(MediaAssetEntity, { id: assetId, tourSessionId: sessionId, status: "published" })
    if (asset === null) throw missing()
    return { asset, body: await this.storage.getObject(asset.objectKey) }
  }

  async saveProvider(staff: StaffAccess, sessionId: string, input: MediaProviderInput): Promise<MediaProvider> {
    const source = await this.database.getDataSource()
    const session = await this.access.staffSession(source.manager, staff, sessionId, "media.publish")
    return source.transaction(async (manager) => {
      await manager.findOneOrFail(TourSessionEntity, { where: { id: sessionId }, lock: { mode: "pessimistic_write" } })
      const old = await manager.findOneBy(MediaProviderEntity, { tourSessionId: sessionId, kind: input.kind })
      assertVersion(old?.version ?? 0, input.expectedVersion)
      const row = old ?? manager.create(MediaProviderEntity, { id: randomUUID(), tourSessionId: sessionId, kind: input.kind, version: 0 })
      Object.assign(row, { label: input.label, url: input.url, enabled: input.enabled, updatedByStaffId: staff.actorId, version: row.version + 1 })
      await manager.save(row)
      await audit(manager, staff, session, { id: row.id, action: "media.provider_updated" })
      return toMediaProvider(row)
    })
  }
}

export function toMediaAsset(row: MediaAssetEntity): MediaAsset {
  return { id: row.id, tourSessionId: row.tourSessionId, title: row.title, kind: row.kind, contentType: row.contentType, byteSize: row.byteSize, status: row.status, version: row.version, authorStaffId: row.authorStaffId, createdAt: row.createdAt.toISOString(), cleanupPending: row.cleanupPending }
}

export function toMediaProvider(row: MediaProviderEntity): MediaProvider {
  return { kind: row.kind, label: row.label, url: row.url, enabled: row.enabled, version: row.version }
}

async function lockedAsset(manager: EntityManager, target: { readonly sessionId: string; readonly assetId: string }): Promise<MediaAssetEntity> {
  const row = await manager.findOne(MediaAssetEntity, { where: { id: target.assetId, tourSessionId: target.sessionId }, lock: { mode: "pessimistic_write" } })
  if (row === null) throw missing()
  return row
}

async function audit(manager: EntityManager, staff: StaffAccess, session: TourSessionEntity, event: { readonly id: string; readonly action: string }): Promise<void> {
  await manager.save(manager.create(AuditLogEntity, { id: randomUUID(), organizationId: session.organizationId, actorId: staff.actorId, action: event.action, targetType: "media", targetId: event.id }))
}

function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) throw conflict("内容已变化，请刷新后重试")
}
function conflict(message: string): ConflictException { return new ConflictException({ code: "media_conflict", message }) }
function missing(): NotFoundException { return new NotFoundException({ code: "media_not_found", message: "素材不存在或尚未发布" }) }
