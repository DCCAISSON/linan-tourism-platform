import { randomUUID } from "node:crypto"
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { SessionArchiveEntity } from "../../domain/entities/session-archive.entity.js"
import { TourSessionEntity } from "../../domain/entities/tour-session.entity.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import { ExecutionAccessService } from "../execution/execution-access.service.js"
import { DevStaffAccessService, type StaffAccess } from "../iam/dev-staff-access.service.js"
import { assertArchiveSection } from "./session-archives.policy.js"
import { captureArchiveSection } from "./session-archives.capture.js"
import { ARCHIVE_SECTIONS, type ArchiveSection, type ArchiveSectionKey } from "./session-archives.types.js"
import { createArchiveWorkbook } from "./session-archives.workbook.js"

@Injectable()
export class SessionArchivesService {
  constructor(
    @Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService,
    @Inject(DevStaffAccessService) private readonly staff: DevStaffAccessService,
    @Inject(ExecutionAccessService) private readonly accounts: ExecutionAccessService,
  ) {}

  async sessions(access: StaffAccess) {
    const manager = (await this.database.getDataSource()).manager
    await this.accounts.requireActiveAccount(manager, access.actorId)
    const sessions = await manager.find(TourSessionEntity, { order: { startsAt: "DESC" } })
    return sessions.map(session => ({ id: session.id, code: session.code, organizationId: session.organizationId, sections: this.allowed(access, session, ARCHIVE_SECTIONS) })).filter(session => session.sections.length > 0)
  }

  async create(access: StaffAccess, sessionId: string, keys: readonly ArchiveSectionKey[]) {
    return (await this.database.getDataSource()).transaction("READ COMMITTED", async manager => {
      const actor = await this.accounts.requireActiveAccount(manager, access.actorId)
      const session = await manager.findOne(TourSessionEntity, { where: { id: sessionId }, lock: { mode: "pessimistic_write" } })
      if (session === null) throw new NotFoundException("团期不存在")
      for (const key of keys) assertArchiveSection(this.staff, access, session, key)
      const previous = await manager.findOne(SessionArchiveEntity, { where: { tourSessionId: sessionId }, order: { version: "DESC" } })
      const sections: ArchiveSection[] = []
      for (const key of keys) sections.push(await captureArchiveSection(manager, session, key))
      const archive = manager.create(SessionArchiveEntity, { id: `archive-${randomUUID()}`, tourSessionId: sessionId, organizationId: session.organizationId, sessionCode: session.code, version: (previous?.version ?? 0) + 1, createdBy: actor.id, creatorName: actor.displayName, createdAt: new Date(), sections })
      await manager.save(archive)
      return summary(archive, sections)
    })
  }

  async list(access: StaffAccess, sessionId: string) {
    const manager = (await this.database.getDataSource()).manager
    const session = await this.session(manager, access, sessionId)
    const allowed = this.allowed(access, session, ARCHIVE_SECTIONS)
    if (allowed.length === 0) throw new ForbiddenException("无权查看该团期归档")
    const rows = await manager.find(SessionArchiveEntity, { where: { tourSessionId: sessionId, organizationId: session.organizationId }, order: { version: "DESC" } })
    return rows.map(row => summary(row, row.sections.filter(section => allowed.includes(section.key)))).filter(row => row.sections.length > 0)
  }

  async detail(access: StaffAccess, sessionId: string, archiveId: string) {
    const { archive, sections } = await this.read(access, sessionId, archiveId)
    return { ...summary(archive, sections), sections }
  }

  async download(access: StaffAccess, sessionId: string, archiveId: string): Promise<Buffer> {
    const { archive, sections } = await this.read(access, sessionId, archiveId)
    return createArchiveWorkbook(archive, sections)
  }

  private async read(access: StaffAccess, sessionId: string, archiveId: string) {
    const manager = (await this.database.getDataSource()).manager
    const session = await this.session(manager, access, sessionId)
    const archive = await manager.findOneBy(SessionArchiveEntity, { id: archiveId, tourSessionId: sessionId, organizationId: session.organizationId })
    if (archive === null) throw new NotFoundException("归档版本不存在")
    const sections = archive.sections.filter(section => this.allowed(access, section.scope, [section.key]).length > 0 && this.allowed(access, session, [section.key]).length > 0)
    if (sections.length === 0) throw new ForbiddenException("无权读取该归档版本的资料")
    return { archive, sections }
  }

  private async session(manager: EntityManager, access: StaffAccess, sessionId: string) {
    await this.accounts.requireActiveAccount(manager, access.actorId)
    const session = await manager.findOneBy(TourSessionEntity, { id: sessionId })
    if (session === null) throw new NotFoundException("团期不存在")
    return session
  }

  private allowed(access: StaffAccess, session: { readonly id: string; readonly organizationId: string }, keys: readonly ArchiveSectionKey[]): readonly ArchiveSectionKey[] {
    return keys.filter(key => {
      try { assertArchiveSection(this.staff, access, session, key); return true }
      catch (error) { if (error instanceof ForbiddenException) return false; throw error }
    })
  }
}

function summary(archive: SessionArchiveEntity, sections: readonly ArchiveSection[]) {
  return { id: archive.id, tourSessionId: archive.tourSessionId, sessionCode: archive.sessionCode, version: archive.version, createdBy: archive.createdBy, creatorName: archive.creatorName, createdAt: archive.createdAt.toISOString(), sections: sections.map(section => ({ key: section.key, capturedAt: section.capturedAt, status: section.status, rowCount: section.rows.length })) }
}
