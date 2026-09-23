import { Injectable, ServiceUnavailableException } from "@nestjs/common"
import type { OnModuleDestroy } from "@nestjs/common"
import { DataSource } from "typeorm"

@Injectable()
export class ConfigurationDatabaseService implements OnModuleDestroy {
  private dataSource: DataSource | null = null

  async getDataSource(): Promise<DataSource> {
    if (this.dataSource?.isInitialized === true) {
      return this.dataSource
    }

    const databaseUrl = process.env["DATABASE_URL"]
    if (databaseUrl === undefined || databaseUrl.length === 0) {
      throw new ServiceUnavailableException({
        code: "database_unavailable",
        message: "database is not configured",
      })
    }

    const { createDomainDataSource } = await import("../../domain/data-source.js")
    const dataSource = createDomainDataSource(databaseUrl)
    await dataSource.initialize()
    this.dataSource = dataSource
    return dataSource
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource?.isInitialized === true) {
      await this.dataSource.destroy()
    }
  }
}
