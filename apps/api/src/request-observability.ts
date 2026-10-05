import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"
import { Catch, HttpException, InternalServerErrorException, type ArgumentsHost, type INestApplication } from "@nestjs/common"
import { BaseExceptionFilter } from "@nestjs/core"
import type { NextFunction, Request, Response } from "express"

type RequestContext = { readonly requestId: string; actorId: string | null }
const requests = new AsyncLocalStorage<RequestContext>()
const callbackRoutes = ["/wechat/payments/callback", "/wechat/refunds/callback"] as const

export function installRequestObservability(app: INestApplication): void {
  app.use((request: Request, response: Response, next: NextFunction) => {
    const context: RequestContext = { requestId: randomUUID(), actorId: null }
    const startedAt = performance.now()
    response.setHeader("X-Request-Id", context.requestId)
    const complete = (aborted: boolean): void => {
      const route: unknown = request.route
      const routePath = typeof route === "object" && route !== null && "path" in route ? route.path : undefined
      process.stdout.write(JSON.stringify({
        event: "http_request", timestamp: new Date().toISOString(), requestId: context.requestId,
        actorId: context.actorId, method: request.method,
        route: typeof routePath === "string" ? routePath : callbackRoutes.find(callback => callback === request.path) ?? "unmatched",
        status: aborted ? null : response.statusCode, aborted,
        durationMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
      }) + "\n")
    }
    response.once("finish", () => complete(false))
    response.once("close", () => {
      if (!response.writableFinished) complete(true)
    })
    requests.run(context, next)
  })
  app.useGlobalFilters(new RequestExceptionFilter(app.getHttpAdapter()))
}

export function recordRequestActor(actorId: string): void {
  const context = requests.getStore()
  if (context !== undefined) context.actorId = actorId
}

@Catch()
class RequestExceptionFilter extends BaseExceptionFilter {
  override catch(error: unknown, host: ArgumentsHost): void {
    if (error instanceof HttpException) {
      super.catch(error, host)
      return
    }
    if (error instanceof Error && "expose" in error && typeof error.expose === "boolean"
      && "statusCode" in error && typeof error.statusCode === "number" && Number.isInteger(error.statusCode)
      && error.statusCode >= 400 && error.statusCode <= 599 && "status" in error && error.status === error.statusCode) {
      super.catch(new HttpException({ statusCode: error.statusCode, message: error.message }, error.statusCode), host)
      return
    }
    super.catch(new InternalServerErrorException({ statusCode: 500, message: "Internal server error" }), host)
  }
}
