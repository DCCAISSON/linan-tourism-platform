import http from "node:http"

const school = { id: "school-e2e", code: "school-e2e", name: "临安研学演示学校" }
const grade = { id: "grade-e2e", organizationId: school.id, code: "grade-e2e", name: "五年级" }
const schoolClass = { id: "class-e2e", gradeId: grade.id, code: "class-e2e", name: "二班" }
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
  { ...sessionBase, id: "session-open-e2e", code: "2026-11-open", status: "published" },
  { ...sessionBase, id: "session-closed-e2e", code: "2026-11-closed", status: "closed" },
]

export function createFixtureServer(baseUrl) {
  const fixture = { catalogBlocked: true, emptyCatalog: false, failCatalog: false, orderPaid: false, orderCreated: false, memberCount: 0, members: [], requests: [] }
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", baseUrl)
    const body = await readJsonBody(request)
    fixture.requests.push({ method: request.method, path: url.pathname, body })

    if (request.method === "GET" && url.pathname === "/schools") {
      while (fixture.catalogBlocked) await delay(50)
      const schools = fixture.emptyCatalog ? [] : [school]
      return json(response, fixture.failCatalog ? 503 : 200, fixture.failCatalog ? { message: "目录服务暂不可用" } : schools)
    }
    if (request.method === "GET" && url.pathname === "/catalog-items") return json(response, 200, fixture.emptyCatalog ? [] : [{ id: "catalog-e2e", organizationId: school.id, code: "course-e2e", title: "临安山水自然探索研学营", status: "active", policyVersion: "v1", description: "走进临安山水，观察自然环境，完成团队探索课程。演示课程介绍。", coverImageUrl: "" }])
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
      const member = { id: `member-e2e-${fixture.memberCount}`, ...body }
      fixture.members.push(member)
      return json(response, 201, member)
    }
    if (request.method === "POST" && url.pathname === "/enrollments") {
      return json(response, 201, { id: "enrollment-e2e", status: "confirmed" })
    }
    if (request.method === "POST" && url.pathname === "/orders") { fixture.orderCreated = true; return json(response, 201, orderResponse(fixture)) }
    if (request.method === "GET" && url.pathname === "/orders") return json(response, 200, fixture.orderCreated ? [orderHistory(fixture)] : [])
    if (request.method === "GET" && url.pathname === "/orders/order-e2e/detail") return json(response, 200, {
      ...orderHistory(fixture), contactName: "演示家长", emergencyContactName: "演示联系人", emergencyContactPhone: "13900000008",
      participants: fixture.members.map((member, index) => ({ id: `line-${index}`, enrollmentParticipantId: `person-${index}`, displayName: member.displayName, gradeName: grade.name, className: schoolClass.name, amountFen: 12_800 })),
    })
    if (request.method === "POST" && url.pathname === "/payments/mock/order-e2e") {
      return json(response, 201, {
        id: "payment-e2e", orderId: "order-e2e", paymentNo: "local_mock:order-e2e",
        provider: "local_mock", status: "pending", amountFen: 25_600,
      })
    }
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
    paidFen: fixture.orderPaid ? 25_600 : 0, payerName: "演示家长", participantCount: 2,
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
