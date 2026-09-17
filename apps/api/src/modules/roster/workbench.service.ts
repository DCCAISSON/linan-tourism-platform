import { ORDER_STATUS, PAYMENT_STATUS, TOUR_SESSION_STATUS } from "@linan/contracts"
import { ForbiddenException, Inject, Injectable } from "@nestjs/common"
import { CatalogItemEntity, OrganizationEntity, TourSessionEntity } from "../../domain/entities/index.js"
import { ConfigurationDatabaseService } from "../configuration/configuration-database.service.js"
import type { StaffAccess } from "../iam/dev-staff-access.service.js"
import type { WorkbenchSession, WorkbenchSummary } from "./workbench.types.js"

type SessionRecord = Omit<WorkbenchSession, "startsAt" | "endsAt"> & {
  readonly startsAt: Date
  readonly endsAt: Date
}
type PaidTotals = { readonly paidHeadcount: number | string; readonly paidAmountFen: number | string }

@Injectable()
export class WorkbenchService {
  constructor(@Inject(ConfigurationDatabaseService) private readonly database: ConfigurationDatabaseService) {}

  async summarize(access: StaffAccess): Promise<WorkbenchSummary> {
    if (access.kind !== "administrator") {
      throw new ForbiddenException({ code: "staff_scope_forbidden", message: "staff identity cannot access operator workbench" })
    }
    const from = new Date()
    const until = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000)
    const dataSource = await this.database.getDataSource()
    const activeActivityCount = await dataSource.getRepository(CatalogItemEntity).countBy({ status: "active" })
    const sessions = await dataSource.getRepository(TourSessionEntity).createQueryBuilder("session")
      .innerJoin(OrganizationEntity, "school", "school.id = session.organization_id")
      .innerJoin(CatalogItemEntity, "activity", "activity.id = session.catalog_item_id")
      .select("session.id", "id").addSelect("session.code", "code")
      .addSelect("session.organization_id", "organizationId").addSelect("school.name", "schoolName")
      .addSelect("session.catalog_item_id", "catalogItemId").addSelect("activity.title", "activityTitle")
      .addSelect("session.starts_at", "startsAt").addSelect("session.ends_at", "endsAt")
      .addSelect("session.status", "status").addSelect("session.price_fen", "priceFen").addSelect("session.capacity", "capacity")
      .where("session.status = :status", { status: TOUR_SESSION_STATUS.published })
      .andWhere("session.starts_at >= :from and session.starts_at < :until", { from, until })
      .orderBy("session.starts_at", "ASC").addOrderBy("session.code", "ASC")
      .getRawMany<SessionRecord>()
    const totals: readonly PaidTotals[] = await dataSource.manager.query(`
      select count(*) as paidHeadcount, coalesce(sum(line.amount_fen), 0) as paidAmountFen
      from order_lines line
      join orders orders on orders.id = line.order_id
      join enrollments enrollment on enrollment.id = orders.enrollment_id
      where orders.status = ?
        and exists (select 1 from payments payment where payment.order_id = orders.id and payment.status = ?)
        and exists (select 1 from roster_entries roster where roster.enrollment_id = enrollment.id
          and roster.enrollment_participant_id = line.enrollment_participant_id)
    `, [ORDER_STATUS.paid, PAYMENT_STATUS.succeeded])
    return {
      generatedAt: from.toISOString(), upcomingFrom: from.toISOString(), upcomingUntil: until.toISOString(),
      activeActivityCount, upcomingSessionCount: sessions.length,
      paidHeadcount: Number(totals[0]?.paidHeadcount ?? 0), paidAmountFen: Number(totals[0]?.paidAmountFen ?? 0),
      upcomingSessions: sessions.map((session) => ({
        ...session, startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(),
      })),
    }
  }
}
