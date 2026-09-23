import "reflect-metadata"
import { DataSource, type DataSourceOptions } from "typeorm"
import { DOMAIN_ENTITIES } from "./entities/index.js"
import { InitialDomainContract1765897200000 } from "../migrations/1765897200000-InitialDomainContract.js"
import { AddSchoolCatalogSchema1765900800000 } from "../migrations/1765900800000-AddSchoolCatalogSchema.js"
import { AddFamilyEnrollmentSchema1765904400000 } from "../migrations/1765904400000-AddFamilyEnrollmentSchema.js"
import { AddOrderPaymentSchema1765908000000 } from "../migrations/1765908000000-AddOrderPaymentSchema.js"
import { AddCatalogContent1765911600000 } from "../migrations/1765911600000-AddCatalogContent.js"
import { AddStaffIam1765915200000 } from "../migrations/1765915200000-AddStaffIam.js"
import { AddEncryptedParticipantData1765918800000 } from "../migrations/1765918800000-AddEncryptedParticipantData.js"
import { AddRosterImports1765922400000 } from "../migrations/1765922400000-AddRosterImports.js"
import { AddNoticeVersions1765926000000 } from "../migrations/1765926000000-AddNoticeVersions.js"
import { AddTransportPlanning1765929600000 } from "../migrations/1765929600000-AddTransportPlanning.js"
import { AddRefundRequestSchema1765933200000 } from "../migrations/1765933200000-AddRefundRequestSchema.js"
import { AddTravelerEligibility1765936800000 } from "../migrations/1765936800000-AddTravelerEligibility.js"
import { AddTransportPeoplePlanning1765940400000 } from "../migrations/1765940400000-AddTransportPeoplePlanning.js"
import { AddExecutionGuideAssignments1765944000000 } from "../migrations/1765944000000-AddExecutionGuideAssignments.js"
import { AddRefundApplications1765947600000 } from "../migrations/1765947600000-AddRefundApplications.js"
import { AddEvaluationFeedback1765951200000 } from "../migrations/1765951200000-AddEvaluationFeedback.js"
import { AddInsuranceWorkspace1765954800000 } from "../migrations/1765954800000-AddInsuranceWorkspace.js"
import { AddMediaSchema1765958400000 } from "../migrations/1765958400000-AddMediaSchema.js"
import { AddCrm1765962000000 } from "../migrations/1765962000000-AddCrm.js"
import { AddBusinessRecords1765965600000 } from "../migrations/1765965600000-AddBusinessRecords.js"
import { AddWechatProtocolSchema1765969200000 } from "../migrations/1765969200000-AddWechatProtocolSchema.js"
import { AddPretripWorkspace1765972800000 } from "../migrations/1765972800000-AddPretripWorkspace.js"
import { AddNotifications1765976400000 } from "../migrations/1765976400000-AddNotifications.js"

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
    AddCatalogContent1765911600000,
    AddStaffIam1765915200000,
    AddEncryptedParticipantData1765918800000,
    AddRosterImports1765922400000,
    AddNoticeVersions1765926000000,
    AddTransportPlanning1765929600000,
    AddRefundRequestSchema1765933200000,
    AddTravelerEligibility1765936800000,
    AddTransportPeoplePlanning1765940400000,
    AddExecutionGuideAssignments1765944000000,
    AddRefundApplications1765947600000,
    AddEvaluationFeedback1765951200000,
    AddInsuranceWorkspace1765954800000,
    AddMediaSchema1765958400000,
    AddCrm1765962000000,
    AddBusinessRecords1765965600000,
    AddWechatProtocolSchema1765969200000,
    AddPretripWorkspace1765972800000,
    AddNotifications1765976400000,
  ],
} satisfies DataSourceOptions

export function createDomainDataSource(databaseUrl: string): DataSource {
  return new DataSource({
    ...DOMAIN_DATA_SOURCE_OPTIONS,
    url: databaseUrl,
  })
}
