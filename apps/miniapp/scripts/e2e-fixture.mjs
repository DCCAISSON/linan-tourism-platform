import http from "node:http"

const school = { id: "school-e2e", code: "school-e2e", name: "临安实验小学" }
const grade = { id: "grade-e2e", organizationId: school.id, code: "grade-e2e", name: "五年级" }
const schoolClass = { id: "class-e2e", gradeId: grade.id, code: "class-e2e", name: "二班" }
const activeNotice = {
  id: "notice-e2e-v1",
  organizationId: school.id,
  tourSessionId: "session-open-e2e",
  version: "v1",
  title: "大明山地质研学告知书 v1",
  createdAt: "2026-09-22T00:00:00.000Z",
  contentJson: {
    destination: "大明山地质研学",
    departurePlace: "临安旅游集散中心门口",
    mealNote: "含午餐，特殊餐食由家长提前备注",
    itinerary: ["1. 集合签到与安全提醒", "2. 乘车前往大明山", "3. 地质地貌观察", "4. 午餐与休整", "5. 研学任务记录", "6. 分享总结", "7. 返程交接"],
    unitPrices: ["学生195元/人", "成人195元/人"],
    packageExamples: ["1名学生195元", "1名成人195元", "1名学生+1名成人390元"],
    reminders: ["请携带身份证件", "请按告知书要求携带证件并准时集合"],
  },
}
const sessionBase = {
  organizationId: school.id,
  catalogItemId: "catalog-e2e",
  priceFen: 12_800,
  capacity: 40,
  startsAt: "2026-11-15T00:00:00.000Z",
  endsAt: "2026-11-16T00:00:00.000Z",
  enrollmentOpensAt: "2026-01-01T00:00:00.000Z",
  enrollmentClosesAt: "2027-01-01T00:00:00.000Z",
  policyVersion: "provisional-domain-policy-v1",
}
const sessions = [
  { ...sessionBase, id: "session-open-e2e", code: "2026-11-open", status: "published", activeNoticeId: activeNotice.id, activeNotice },
  { ...sessionBase, id: "session-closed-e2e", code: "2026-11-closed", status: "closed", activeNoticeId: null, activeNotice: null },
]
const businessProduct = {
  id: "business-e2e-tourism",
  organizationId: school.id,
  category: "tourism",
  title: "临安山水两日行",
  offering: "面向家庭的小团行程咨询",
  content: "包含路线资料和人工咨询回执，不代表实时库存或预订成功。",
  referencePriceFen: 68_800,
  customerServicePhone: "19900000009",
  bookingUrl: "",
  bookingAuthorized: false,
  media: [],
  mediaAuthorized: false,
  status: "published",
  version: 1,
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
}

export function createFixtureServer(baseUrl) {
  const fixture = { catalogBlocked: true, emptyCatalog: false, failCatalog: false, orderPaid: false, orderCreated: false, memberCount: 0, members: [], requests: [] }
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", baseUrl)
    const body = await readJsonBody(request)
    fixture.requests.push({ method: request.method, path: url.pathname, body })

    if (request.method === "GET" && url.pathname === "/capabilities") return json(response, 200, { wechatPaymentEnabled: false, wechatRefundEnabled: false, paymentReconciliationEnabled: false })
    if (request.method === "GET" && url.pathname === "/schools") {
      while (fixture.catalogBlocked) await delay(50)
      const schools = fixture.emptyCatalog ? [] : [school]
      return json(response, fixture.failCatalog ? 503 : 200, fixture.failCatalog ? { message: "目录服务暂不可用" } : schools)
    }
    if (request.method === "GET" && url.pathname === "/catalog-items") return json(response, 200, fixture.emptyCatalog ? [] : [{ id: "catalog-e2e", organizationId: school.id, code: "course-e2e", title: "临安山水自然探索研学营", status: "active", policyVersion: "v1", description: "走进临安山水，观察自然环境，完成团队探索课程。课程介绍。", coverImageUrl: "" }])
    if (request.method === "GET" && url.pathname === "/enrollment/members") return json(response, 200, fixture.members)
    if (request.method === "GET" && url.pathname === `/schools/${school.id}/grades`) return json(response, 200, [grade])
    if (request.method === "GET" && url.pathname === `/grades/${grade.id}/classes`) return json(response, 200, [schoolClass])
    if (request.method === "GET" && url.pathname === "/tour-sessions") {
      while (fixture.catalogBlocked) await delay(50)
      return json(response, 200, fixture.emptyCatalog ? [] : sessions)
    }
    if (request.method === "GET" && url.pathname === `/tour-sessions/${sessions[0].id}/enrollment-availability`) {
      return json(response, 200, { available: true, tourSessionId: sessions[0].id, at: url.searchParams.get("at") })
    }
    if (request.method === "POST" && url.pathname === "/enrollment/members") {
      fixture.memberCount += 1
      const member = {
        id: `member-e2e-${fixture.memberCount}`,
        ...body,
        schoolId: body.schoolId ?? null,
        gradeId: body.gradeId ?? null,
        classId: body.classId ?? null,
      }
      fixture.members.push(member)
      return json(response, 201, member)
    }
    if (request.method === "POST" && url.pathname === "/enrollments") {
      fixture.enrollmentBody = body
      return json(response, 201, { id: "enrollment-e2e", status: "confirmed" })
    }
    if (request.method === "POST" && url.pathname === "/orders") { fixture.orderCreated = true; return json(response, 201, orderResponse(fixture)) }
    if (request.method === "GET" && url.pathname === "/orders") return json(response, 200, fixture.orderCreated ? [orderHistory(fixture)] : [])
    if (request.method === "GET" && url.pathname === "/orders/order-e2e/detail") return json(response, 200, {
      ...orderHistory(fixture), contactName: "王女士", emergencyContactName: "赵女士", emergencyContactPhone: "19900000008",
      refundSummary: { status: "none", refundedFen: 0, pendingFen: 0, failedCount: 0 }, refundHistory: [],
      participants: fixture.members.map((member, index) => {
        const participantKind = member.participantKind === "adult" ? "adult" : "student"
        return {
          id: `line-${index}`, enrollmentParticipantId: `person-${index}`, displayName: member.displayName,
          participantKind, gradeName: participantKind === "adult" ? null : grade.name,
          className: participantKind === "adult" ? null : schoolClass.name, amountFen: 12_800,
          refundedFen: 0, refundStatus: "none",
        }
      }),
    })
    if (request.method === "POST" && url.pathname === "/payments/mock/order-e2e") {
      return json(response, 201, {
        id: "payment-e2e", orderId: "order-e2e", paymentNo: "local_mock:order-e2e",
        provider: "local_mock", status: "pending", amountFen: 25_600,
      })
    }
    if (request.method === "GET" && url.pathname === "/orders/order-e2e/pretrip") return json(response, 200, {
      orderId: "order-e2e",
      tourSessionId: sessions[0].id,
      config: {
        gatheringAt: "2026-11-15T00:30:00.000Z",
        gatheringPlace: "临安旅游集散中心门口",
        travelMode: "group",
        itineraryNote: "请提前十分钟到达，实际安排以工作人员通知为准。",
        contactName: "陈老师",
        contactPhone: "19900000010",
        serviceContact: "行前服务台",
        noticeVersionId: activeNotice.id,
        version: 2,
        attachments: [],
      },
      transportStatus: "stale",
      persons: fixture.members.map((member, index) => ({
        orderLineId: `line-${index}`,
        displayName: member.displayName,
        vehicleStatus: "stale",
        vehicle: null,
      })),
    })
    if (request.method === "GET" && url.pathname === "/orders/order-e2e/refund-applications") return json(response, 200, [{
      id: "refund-application-e2e",
      orderId: "order-e2e",
      status: "rejected",
      reason: "行程时间冲突",
      amountFen: 12_800,
      lines: [{ lineId: "line-0", displayName: "张同学", amountFen: 12_800 }],
      submittedAt: "2026-09-22T01:00:00.000Z",
      updatedAt: "2026-09-22T02:00:00.000Z",
      reviewReason: "工作人员已按当前规则完成审核",
      reviewedAt: "2026-09-22T02:00:00.000Z",
      refundRequestId: null,
      refundStatus: null,
    }])
    if (request.method === "GET" && url.pathname === "/orders/order-e2e/media") return json(response, 200, {
      assets: [],
      providers: [
        { kind: "album", label: "图片直播入口", url: "https://album.example.test/demo", enabled: true, version: 1 },
        { kind: "live", label: "视频直播入口", url: "https://live.example.test/demo", enabled: true, version: 1 },
      ],
    })
    if (request.method === "GET" && url.pathname === "/orders/order-e2e/notifications") return json(response, 200, {
      orderId: "order-e2e",
      authorizations: [
        { id: "notification-auth-e2e-active", orderId: "order-e2e", receiverName: "王女士", relation: "guardian", channel: "wechat_subscribe", active: true, version: 2, revokedAt: null, createdAt: "2026-09-22T00:00:00.000Z" },
        { id: "notification-auth-e2e-withdrawn", orderId: "order-e2e", receiverName: "赵女士", relation: "emergency_contact", channel: "manual", active: false, version: 3, revokedAt: "2026-09-22T03:00:00.000Z", createdAt: "2026-09-21T00:00:00.000Z" },
      ],
      entries: [
        { kind: "enterprise_wechat", label: "企业微信服务入口", url: "https://work.example.test/demo", enabled: true, version: 1 },
        { kind: "official_account", label: "公众号服务入口", url: "https://official.example.test/demo", enabled: true, version: 1 },
        { kind: "customer_service", label: "客服入口", url: "https://service.example.test/demo", enabled: true, version: 1 },
      ],
    })
    if (request.method === "GET" && url.pathname === "/orders/order-e2e/execution/public-summary") return json(response, 200, {
      tourSessionId: sessions[0].id,
      dailyReports: [{ reportDate: "2026-11-15", publicSummary: "队伍已完成集合和安全说明。" }],
      events: [{ occurredAt: "2026-11-15T03:30:00.000Z", category: "schedule", publicSummary: "午餐后按计划继续课程。" }],
    })
    if (request.method === "GET" && url.pathname === "/business/products") {
      return json(response, 200, url.searchParams.get("category") === businessProduct.category ? [businessProduct] : [])
    }
    if (request.method === "GET" && url.pathname === `/business/products/${businessProduct.id}`) return json(response, 200, businessProduct)
    if (request.method === "GET" && url.pathname === "/orders/order-e2e") return json(response, 200, orderResponse(fixture))
    return json(response, 404, { message: `No fixture route for ${request.method} ${url.pathname}` })
  })
  return { fixture, server }
}

export function listen(httpServer, port) {
  return new Promise((resolve, reject) => {
    httpServer.once("error", reject)
    httpServer.listen(port, "127.0.0.1", () => resolve())
  })
}

export function closeServer(httpServer) {
  return new Promise((resolve) => httpServer.close(() => resolve()))
}

function orderResponse(fixture) {
  return {
    id: "order-e2e", code: "ORDER-E2E", enrollmentId: "enrollment-e2e",
    status: fixture.orderPaid ? "paid" : "pending_payment", amountFen: 25_600,
    paidFen: fixture.orderPaid ? 25_600 : 0, payerName: "王女士", participantCount: 2,
  }
}

function orderHistory(fixture) {
  return { ...orderResponse(fixture), tourSessionId: sessions[0].id, activityTitle: "临安山水自然探索研学营", schoolName: school.name, startsAt: sessionBase.startsAt, endsAt: sessionBase.endsAt, createdAt: "2026-09-17T00:00:00.000Z" }
}

async function readJsonBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"))
}

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(body))
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)) }
