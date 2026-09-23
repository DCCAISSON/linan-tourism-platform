import { Test } from "@nestjs/testing"
import { describe, expect, it } from "vitest"
import { EnrollmentIdentityService } from "../enrollment/enrollment.identity.js"
import { PretripController } from "./pretrip.controller.js"
import { PretripModule } from "./pretrip.module.js"
import { PretripService } from "./pretrip.service.js"

describe("PretripModule", () => {
  it("wires controller, service, and family identity provider without importing EnrollmentModule", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PretripModule] }).compile()

    try {
      expect(moduleRef.get(PretripController)).toBeInstanceOf(PretripController)
      expect(moduleRef.get(PretripService)).toBeInstanceOf(PretripService)
      expect(moduleRef.get(EnrollmentIdentityService)).toBeInstanceOf(EnrollmentIdentityService)
    } finally {
      await moduleRef.close()
    }
  })
})
