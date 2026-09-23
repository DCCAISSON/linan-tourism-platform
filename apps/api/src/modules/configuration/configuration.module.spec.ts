import { Inject, Injectable } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { describe, expect, it } from "vitest"
import { InsuranceModule } from "../insurance/insurance.module.js"
import { InsuranceService } from "../insurance/insurance.service.js"

@Injectable()
class InsuranceConsumer {
  constructor(@Inject(InsuranceService) readonly insurance: InsuranceService) {}
}

describe("Configuration module Nest wiring", () => {
  it("lets an importing insurance module resolve database and audit dependencies", async () => {
    // Given / When
    const moduleRef = await Test.createTestingModule({
      imports: [InsuranceModule],
      providers: [InsuranceConsumer],
    }).compile()

    try {
      const consumer = moduleRef.get(InsuranceConsumer)

      // Then
      expect(consumer.insurance).toBeInstanceOf(InsuranceService)
    } finally {
      await moduleRef.close()
    }
  })
})
