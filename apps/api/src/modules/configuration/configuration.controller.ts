import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common"
import { ConfigurationService } from "./configuration.service.js"
import {
  malformedInput,
  parseAvailabilityTime,
  parseCatalogItem,
  parseCatalogItemPatch,
  parseClass,
  parseClassPatch,
  parseGrade,
  parseGradePatch,
  parseSchool,
  parseSchoolPatch,
  parseTourSession,
  parseTourSessionPatch,
} from "./configuration.parser.js"
import type {
  CatalogItemResponse,
  ClassResponse,
  EnrollmentAvailabilityResponse,
  GradeResponse,
  SchoolResponse,
  TourSessionResponse,
} from "./configuration.types.js"

@Controller()
export class ConfigurationController {
  constructor(@Inject(ConfigurationService) private readonly configuration: ConfigurationService) {}

  @Post("schools")
  async createSchool(@Body() body: unknown): Promise<SchoolResponse> {
    return this.configuration.createSchool(parseSchool(body))
  }

  @Get("schools")
  async listSchools(): Promise<readonly SchoolResponse[]> {
    return this.configuration.listSchools()
  }

  @Patch("schools/:id")
  async updateSchool(@Param("id") id: string, @Body() body: unknown): Promise<SchoolResponse> {
    return this.configuration.updateSchool(id, parseSchoolPatch(body))
  }

  @Delete("schools/:id")
  async deleteSchool(@Param("id") id: string): Promise<void> {
    await this.configuration.deleteSchool(id)
  }

  @Post("schools/:schoolId/grades")
  async createGrade(
    @Param("schoolId") schoolId: string,
    @Body() body: unknown,
  ): Promise<GradeResponse> {
    return this.configuration.createGrade(parseGrade(body, schoolId))
  }

  @Get("schools/:schoolId/grades")
  async listGrades(@Param("schoolId") schoolId: string): Promise<readonly GradeResponse[]> {
    return this.configuration.listGrades(schoolId)
  }

  @Patch("grades/:id")
  async updateGrade(@Param("id") id: string, @Body() body: unknown): Promise<GradeResponse> {
    return this.configuration.updateGrade(id, parseGradePatch(body))
  }

  @Delete("grades/:id")
  async deleteGrade(@Param("id") id: string): Promise<void> {
    await this.configuration.deleteGrade(id)
  }

  @Post("grades/:gradeId/classes")
  async createClass(
    @Param("gradeId") gradeId: string,
    @Body() body: unknown,
  ): Promise<ClassResponse> {
    return this.configuration.createClass(parseClass(body, gradeId))
  }

  @Get("grades/:gradeId/classes")
  async listClasses(@Param("gradeId") gradeId: string): Promise<readonly ClassResponse[]> {
    return this.configuration.listClasses(gradeId)
  }

  @Patch("classes/:id")
  async updateClass(@Param("id") id: string, @Body() body: unknown): Promise<ClassResponse> {
    return this.configuration.updateClass(id, parseClassPatch(body))
  }

  @Delete("classes/:id")
  async deleteClass(@Param("id") id: string): Promise<void> {
    await this.configuration.deleteClass(id)
  }

  @Post("catalog-items")
  async createCatalogItem(@Body() body: unknown): Promise<CatalogItemResponse> {
    return this.configuration.createCatalogItem(parseCatalogItem(body))
  }

  @Get("catalog-items")
  async listCatalogItems(): Promise<readonly CatalogItemResponse[]> {
    return this.configuration.listCatalogItems()
  }

  @Patch("catalog-items/:id")
  async updateCatalogItem(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CatalogItemResponse> {
    return this.configuration.updateCatalogItem(id, parseCatalogItemPatch(body))
  }

  @Delete("catalog-items/:id")
  async deleteCatalogItem(@Param("id") id: string): Promise<void> {
    await this.configuration.deleteCatalogItem(id)
  }

  @Post("tour-sessions")
  async createTourSession(@Body() body: unknown): Promise<TourSessionResponse> {
    return this.configuration.createTourSession(parseTourSession(body))
  }

  @Get("tour-sessions")
  async listTourSessions(): Promise<readonly TourSessionResponse[]> {
    return this.configuration.listTourSessions()
  }

  @Patch("tour-sessions/:id")
  async updateTourSession(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<TourSessionResponse> {
    return this.configuration.updateTourSession(id, parseTourSessionPatch(body))
  }

  @Delete("tour-sessions/:id")
  async deleteTourSession(@Param("id") id: string): Promise<void> {
    await this.configuration.deleteTourSession(id)
  }

  @Get("tour-sessions/:id/enrollment-availability")
  async checkEnrollmentAvailability(
    @Param("id") id: string,
    @Query("at") at: string | undefined,
  ): Promise<EnrollmentAvailabilityResponse> {
    if (typeof at !== "string") {
      throw malformedInput("at must be an ISO date")
    }

    return this.configuration.checkEnrollmentAvailability(id, parseAvailabilityTime(at))
  }
}
