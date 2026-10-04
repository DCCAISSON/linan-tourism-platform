import { randomUUID } from "node:crypto"
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { AuditLogEntity } from "../../domain/entities/audit-log.entity.js"
import { PretripAttachmentEntity } from "../../domain/entities/pretrip-attachment.entity.js"
import { PretripConfigEntity } from "../../domain/entities/pretrip-config.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { DevStaffAccessService, type StaffAccess } from "../iam/dev-staff-access.service.js"
import { MediaStorageService } from "../media/media-storage.service.js"
import { recordPretripNotificationSource } from "../notifications/notification-business-source.js"
import type { PretripAttachmentUpload } from "./pretrip-attachments.parser.js"
import type { PretripAttachmentInput, PretripAttachmentResponse } from "./pretrip.types.js"

export type PretripAttachmentContent = { readonly attachment: PretripAttachmentResponse; readonly body: Buffer }

@Injectable()
export class PretripAttachmentsService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
    @Inject(MediaStorageService) private readonly storage: MediaStorageService,
  ) {}

  async upload(access: StaffAccess, sessionId: string, input: PretripAttachmentUpload): Promise<void> {
    const source = await this.database.getDataSource()
    const session = await source.manager.findOneBy(TourSessionEntity, { id: sessionId })
    if (session === null) throw missing()
    this.staffAccess.assertPretripManageScope(access, { schoolId: session.organizationId, requestedSchoolId: session.organizationId, requestedClassId: null, tourSessionId: session.id })
    const id = randomUUID()
    const objectKey = `pretrip/${session.id}/${id}.${input.extension}`
    let uploadStarted = false
    try {
      await source.transaction(async (manager) => {
        await manager.findOneOrFail(TourSessionEntity, { where: { id: session.id }, lock: { mode: "pessimistic_write" } })
        const config = await manager.findOne(PretripConfigEntity, { where: { tourSessionId: session.id }, lock: { mode: "pessimistic_write" } })
        if (config === null) throw new ConflictException({ code: "pretrip_config_required", message: "请先保存行前配置，再上传附件" })
        if (config.version !== input.expectedVersion) throw new ConflictException({ code: "pretrip_stale", message: "行前配置已更新，请重新读取后上传" })
        uploadStarted = true
        await this.storage.putObject({ key: objectKey, contentType: input.contentType, body: input.body })
        await manager.save(manager.create(PretripAttachmentEntity, { id, tourSessionId: session.id, title: input.title, objectKey, contentType: input.contentType, byteSize: input.body.length, createdByStaffId: access.actorId }))
        config.version += 1
        config.updatedByStaffId = access.actorId
        await manager.save(config)
        await manager.save(manager.create(AuditLogEntity, { id: randomUUID(), organizationId: session.organizationId, actorId: access.actorId, action: "pretrip.attachment.uploaded", targetType: "pretrip", targetId: id }))
        await recordPretripNotificationSource(manager, { session, config })
      })
    } catch (error) {
      if (uploadStarted) {
        try { await this.storage.deleteObject(objectKey) }
        catch (cleanupError) {
          if (!(cleanupError instanceof Error)) throw cleanupError
          throw new ServiceUnavailableException({ code: "pretrip_attachment_cleanup_failed", message: "附件保存失败，请联系工作人员处理后重试" })
        }
      }
      throw error
    }
  }

  async retain(manager: EntityManager, sessionId: string, selection: readonly PretripAttachmentInput[] | undefined): Promise<void> {
    if (selection === undefined) return
    const current = await manager.findBy(PretripAttachmentEntity, { tourSessionId: sessionId })
    const ids = new Set(selection.map((item) => item.id))
    if (ids.size !== selection.length || selection.some((item) => !current.some((row) => row.id === item.id))) throw new BadRequestException({ code: "pretrip_attachment_invalid", message: "附件只能引用本团已上传的文件，请重新读取配置" })
    for (const row of current) {
      const retained = selection.find((item) => item.id === row.id)
      if (retained === undefined) await manager.delete(PretripAttachmentEntity, { id: row.id, tourSessionId: sessionId })
      else if (row.title !== retained.title) { row.title = retained.title; await manager.save(row) }
    }
  }

  async content(row: PretripAttachmentEntity): Promise<PretripAttachmentContent> {
    const prefix = `pretrip/${row.tourSessionId}/`
    if (!row.objectKey.startsWith(prefix) || !/^[0-9a-f-]{36}\.(pdf|png|jpg|webp|doc|docx)$/.test(row.objectKey.slice(prefix.length))) throw missing()
    const body = await this.storage.getObject(row.objectKey)
    return { attachment: { id: row.id, title: row.title, contentType: row.contentType, byteSize: row.byteSize }, body }
  }
}

function missing(): NotFoundException {
  return new NotFoundException({ code: "pretrip_not_found", message: "附件暂不可用，请联系行前联系人" })
}
