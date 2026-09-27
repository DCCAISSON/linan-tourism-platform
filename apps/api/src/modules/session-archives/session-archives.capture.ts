import { In, type EntityManager } from "typeorm"
import { EnrollmentEntity, OrderEntity } from "../../domain/entities/index.js"
import { ExecutionAttendanceEntity } from "../../domain/entities/execution-attendance.entity.js"
import { ExecutionDailyReportEntity } from "../../domain/entities/execution-daily-report.entity.js"
import { ExecutionPersonDailyReportEntity } from "../../domain/entities/execution-person-daily-report.entity.js"
import { ExecutionPersonDailyRevisionEntity } from "../../domain/entities/execution-person-daily-revision.entity.js"
import { ExecutionPlanNodeEntity } from "../../domain/entities/execution-plan-node.entity.js"
import { ExecutionOccurrenceEntity } from "../../domain/entities/execution-occurrence.entity.js"
import { StudentEvaluationEntity } from "../../domain/entities/student-evaluation.entity.js"
import { RefundApplicationEntity } from "../../domain/entities/refund-application.entity.js"
import { isEligibleEvaluationStudent } from "../evaluations/evaluations.policy.js"
import { buildOrderRefundView } from "../order/refund-read-model.js"
import { readTransportConfirmation } from "../transport/transport-confirmation.read.js"
import { readTravelers } from "../travelers/travelers.read-model.js"
import { SECTION_PERMISSIONS } from "./session-archives.policy.js"
import type { ArchiveCell, ArchiveSection, ArchiveSectionKey } from "./session-archives.types.js"

export async function captureArchiveSection(manager: EntityManager, session: { readonly id: string; readonly organizationId: string }, key: ArchiveSectionKey): Promise<ArchiveSection> {
  const base = { key, capturedAt: new Date().toISOString(), permissionKeys: SECTION_PERMISSIONS[key], scope: { id: session.id, organizationId: session.organizationId }, status: "captured" }
  switch (key) {
    case "orders": case "refunds": {
      const enrollments = await manager.findBy(EnrollmentEntity, { tourSessionId: session.id, organizationId: session.organizationId })
      const orders = enrollments.length === 0 ? [] : await manager.find(OrderEntity, { where: { enrollmentId: In(enrollments.map(row => row.id)), organizationId: session.organizationId }, order: { createdAt: "ASC", id: "ASC" } })
      if (key === "orders") return { ...base, columns: ["订单编号", "付款人", "状态", "应付分", "已付分", "创建时间"], rows: orders.map(row => [row.code, row.payerName, row.status, row.amountFen, row.paidFen, row.createdAt.toISOString()]) }
      const rows: ArchiveCell[][] = []
      for (const order of orders) {
        const view = await buildOrderRefundView(manager, order.id, order.amountFen)
        for (const refund of view.history) {
          if (refund.lines.length === 0) rows.push(["退款执行", order.code, refund.id, refund.status, refund.amountFen, null, null, refund.requestedAt, refund.processedAt])
          for (const line of refund.lines) rows.push(["退款执行", order.code, refund.id, refund.status, refund.amountFen, line.displayName, line.amountFen, refund.requestedAt, refund.processedAt])
        }
        const applications = await manager.find(RefundApplicationEntity, { where: { orderId: order.id }, order: { createdAt: "ASC", id: "ASC" } })
        for (const application of applications) {
          const common = ["申请审核", order.code, application.id, application.status, application.amountFen]
          if (application.lines.length === 0) rows.push([...common, null, null, application.createdAt.toISOString(), application.reviewedAt?.toISOString() ?? null, application.reviewedByStaffId, application.refundRequestId])
          for (const line of application.lines) rows.push([...common, line.displayName, line.amountFen, application.createdAt.toISOString(), application.reviewedAt?.toISOString() ?? null, application.reviewedByStaffId, application.refundRequestId])
        }
      }
      return { ...base, columns: ["记录类型", "订单编号", "记录编号", "状态", "申请总额分", "人员", "人员退款分", "申请时间", "处理或审核时间", "审核人", "关联退款编号"], rows }
    }
    case "roster": {
      const snapshot = await readTravelers(manager, session.id)
      return { ...base, columns: ["人员引用", "姓名", "年级", "班级", "来源", "人员类型", "有效", "失效原因", "冲突", "证件脱敏", "电话脱敏", "名单版本"], rows: snapshot.travelers.map(row => [row.personRef, row.displayName, row.gradeName, row.className, row.source, row.participantKind ?? row.importedRole, row.active, row.inactiveReason, row.conflict?.code ?? null, row.identityMasked, row.phoneMasked, snapshot.rosterVersion]) }
    }
    case "transport": {
      const state = await readTransportConfirmation(manager, session.id)
      return { ...base, status: state.status === "current" ? "已确认" : state.status === "stale" ? "已失效，未归档最终分车名单" : "未确认，未归档最终分车名单", columns: ["确认编号", "名单版本", "分车版本", "人员引用", "姓名", "年级", "班级", "车辆序号", "车牌"], rows: state.status === "current" ? state.snapshot.assignments.map(row => { const vehicle = state.snapshot.vehicles.find(item => item.id === row.vehicleId); return [state.confirmationId, state.rosterVersion, state.planVersion, row.personRef, row.displayName, row.gradeName, row.className, vehicle?.sequence ?? null, vehicle?.plateNumber ?? null] }) : [] }
    }
    case "evaluations": {
      const snapshot = await readTravelers(manager, session.id)
      const eligible = new Set<string>(snapshot.travelers.filter(isEligibleEvaluationStudent).map(row => row.personRef))
      const evaluations = await manager.find(StudentEvaluationEntity, { where: { tourSessionId: session.id, organizationId: session.organizationId }, order: { className: "ASC", displayName: "ASC" } })
      return { ...base, columns: ["人员引用", "姓名", "年级", "班级", "等级", "等级说明", "确认时间"], rows: evaluations.filter(row => eligible.has(row.personRef) && row.confirmedAt !== null && (row.gradeCode === "A" || row.gradeCode === "B") && row.gradeLabel !== null).map(row => [row.personRef, row.displayName, row.gradeName, row.className, row.gradeCode, row.gradeLabel, row.confirmedAt?.toISOString() ?? null]) }
    }
    case "execution": return { ...base, ...await captureExecution(manager, session.id) }
  }
}

async function captureExecution(manager: EntityManager, tourSessionId: string): Promise<Pick<ArchiveSection, "columns" | "rows">> {
  const [attendance, daily, history, nodes, occurrences, teamDaily] = await Promise.all([
    manager.find(ExecutionAttendanceEntity, { where: { tourSessionId }, order: { id: "ASC" } }),
    manager.find(ExecutionPersonDailyReportEntity, { where: { tourSessionId }, order: { reportDate: "ASC", id: "ASC" } }),
    manager.find(ExecutionPersonDailyRevisionEntity, { where: { tourSessionId }, order: { reportDate: "ASC", version: "ASC", id: "ASC" } }),
    manager.find(ExecutionPlanNodeEntity, { where: { tourSessionId }, order: { reportDate: "ASC", id: "ASC" } }),
    manager.find(ExecutionOccurrenceEntity, { where: { tourSessionId }, order: { createdAt: "ASC", id: "ASC" } }),
    manager.find(ExecutionDailyReportEntity, { where: { tourSessionId }, order: { reportDate: "ASC", id: "ASC" } }),
  ])
  const rows: ArchiveCell[][] = []
  for (const row of attendance) rows.push(["点名", row.id, row.personRef, null, null, row.status, null, null, null, null, row.updatedAt.toISOString()])
  for (const row of daily) rows.push(["每日记录", row.id, row.personRef, row.reportDate, null, row.lodgingCheck.length > 0 ? "住宿已记录" : "住宿未记录", row.breakfast, row.lunch, row.dinner, row.version, row.updatedAt.toISOString()])
  for (const row of history) rows.push(["每日历史", row.reportId, row.personRef, row.reportDate, null, row.snapshot.lodgingCheck.length > 0 ? "住宿已记录" : "住宿未记录", row.snapshot.breakfast, row.snapshot.lunch, row.snapshot.dinner, row.version, row.createdAt.toISOString()])
  for (const row of teamDaily) rows.push(["团队每日", row.id, null, row.reportDate, null, row.lodgingCheck.length > 0 ? "住宿已记录" : "住宿未记录", null, null, null, row.version, row.updatedAt.toISOString()])
  for (const row of nodes) rows.push(["计划节点", row.id, null, row.reportDate, row.type, row.active ? "有效" : "停用", null, null, null, row.version, row.scheduledTime])
  for (const row of occurrences) rows.push(["节点记录", row.id, row.personRef, row.reportDate, row.type, row.status, null, null, null, row.version, row.occurredAt.toISOString(), row.nodeId, row.correctsId])
  return { columns: ["记录类型", "记录编号", "人员引用", "日期", "节点类型", "状态", "早餐", "午餐", "晚餐", "版本", "时间", "节点编号", "更正原记录"], rows }
}
