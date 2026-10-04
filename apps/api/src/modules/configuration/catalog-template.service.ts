import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common"
import type { EntityManager } from "typeorm"
import { CatalogContentTemplateEntity } from "../../domain/entities/catalog-content-template.entity.js"
import { CatalogItemEntity } from "../../domain/entities/catalog-item.entity.js"
import { OrganizationEntity } from "../../domain/entities/organization.entity.js"
import { ConfigurationDatabaseService } from "./configuration-database.service.js"
import { throwWriteConflict } from "./configuration.errors.js"
import { makeId } from "./configuration.persistence.js"
import type { CatalogTemplateContent } from "./catalog-template.parser.js"

@Injectable()
export class CatalogTemplateService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async list(): Promise<readonly CatalogContentTemplateEntity[]> {
    return (await this.database.getDataSource()).manager.find(CatalogContentTemplateEntity, { order: { createdAt: "ASC" } })
  }

  async create(content: CatalogTemplateContent): Promise<CatalogContentTemplateEntity> {
    const manager = (await this.database.getDataSource()).manager
    return manager.save(manager.create(CatalogContentTemplateEntity, { ...content, id: makeId("catalog-template") }))
  }

  async update(id: string, content: CatalogTemplateContent, expectedVersion: number): Promise<CatalogContentTemplateEntity> {
    const source = await this.database.getDataSource()
    return source.transaction(async manager => {
      const template = await lockTemplate(manager, id)
      if (template.version !== expectedVersion) {
        throw new ConflictException({ code: "catalog_template_changed", message: "课程模板已更新，请刷新后再修改" })
      }
      Object.assign(template, content, { version: template.version + 1 })
      await manager.save(template)
      await manager.update(CatalogItemEntity, { templateId: id }, content)
      return template
    })
  }

  async addSchool(templateId: string, input: { readonly organizationId: string; readonly code: string }): Promise<CatalogItemEntity> {
    const source = await this.database.getDataSource()
    try {
      return await source.transaction(async manager => {
        const template = await lockTemplate(manager, templateId)
        if (await manager.findOneBy(OrganizationEntity, { id: input.organizationId }) === null) {
          throw new NotFoundException({ code: "not_found", message: "学校不存在" })
        }
        return manager.save(manager.create(CatalogItemEntity, {
          ...input, id: makeId("catalog"), templateId, title: template.title,
          description: template.description, coverImageUrl: template.coverImageUrl,
        }))
      })
    } catch (error) {
      throwWriteConflict(error)
    }
  }

  async link(catalogItemId: string, templateId: string | null): Promise<CatalogItemEntity> {
    return (await this.database.getDataSource()).transaction(async manager => {
      const template = templateId === null ? null : await lockTemplate(manager, templateId)
      const item = await manager.findOne(CatalogItemEntity, { where: { id: catalogItemId }, lock: { mode: "pessimistic_write" } })
      if (item === null) throw new NotFoundException({ code: "not_found", message: "学校课程不存在" })
      item.templateId = templateId
      if (template !== null) {
        item.title = template.title
        item.description = template.description
        item.coverImageUrl = template.coverImageUrl
      }
      return manager.save(item)
    })
  }
}

async function lockTemplate(manager: EntityManager, id: string): Promise<CatalogContentTemplateEntity> {
  const template = await manager.findOne(CatalogContentTemplateEntity, { where: { id }, lock: { mode: "pessimistic_write" } })
  if (template === null) throw new NotFoundException({ code: "not_found", message: "课程模板不存在" })
  return template
}
