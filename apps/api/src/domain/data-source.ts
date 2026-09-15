import "reflect-metadata"
import { DataSource, type DataSourceOptions } from "typeorm"
import { DOMAIN_ENTITIES } from "./entities/index.js"
import { InitialDomainContract1765897200000 } from "../migrations/1765897200000-InitialDomainContract.js"
import { AddSchoolCatalogSchema1765900800000 } from "../migrations/1765900800000-AddSchoolCatalogSchema.js"
import { AddFamilyEnrollmentSchema1765904400000 } from "../migrations/1765904400000-AddFamilyEnrollmentSchema.js"
import { AddOrderPaymentSchema1765908000000 } from "../migrations/1765908000000-AddOrderPaymentSchema.js"

export const DOMAIN_DATA_SOURCE_OPTIONS = {
  type: "mysql",
  charset: "utf8mb4",
  synchronize: false,
  migrationsRun: false,
  migrationsTableName: "typeorm_migrations",
  migrationsTransactionMode: "all",
  entities: DOMAIN_ENTITIES,
  migrations: [
    InitialDomainContract1765897200000,
    AddSchoolCatalogSchema1765900800000,
    AddFamilyEnrollmentSchema1765904400000,
    AddOrderPaymentSchema1765908000000,
  ],
} satisfies DataSourceOptions

export function createDomainDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    ...DOMAIN_DATA_SOURCE_OPTIONS,
    url: databaseUrl,
  })
}
