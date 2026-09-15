import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common"
import { DevStaffAccessService } from "../iam/dev-staff-access.service.js"
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
  constructor(
    @Inject(ConfigurationService) private readonly configuration: ConfigurationService,
    @Inject(DevStaffAccessService) private readonly staffAccess: DevStaffAccessService,
  ) {}

  @Post("schools")
  async createSchool(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<SchoolResponse> {
    this.assertWrite(headers)
    return this.configuration.createSchool(parseSchool(body))
  }

  @Get("schools")
  async listSchools(): Promise<readonly SchoolResponse[]> {
    return this.configuration.listSchools()
  }

  @Patch("schools/:id")
  async updateSchool(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<SchoolResponse> {
    this.assertWrite(headers)
    return this.configuration.updateSchool(id, parseSchoolPatch(body))
  }

  @Delete("schools/:id")
  async deleteSchool(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<void> {
    this.assertWrite(headers)
    await this.configuration.deleteSchool(id)
  }

  @Post("schools/:schoolId/grades")
  async createGrade(
    @Headers() headers: RequestHeaders,
    @Param("schoolId") schoolId: string,
    @Body() body: unknown,
  ): Promise<GradeResponse> {
    this.assertWrite(headers)
    return this.configuration.createGrade(parseGrade(body, schoolId))
  }

  @Get("schools/:schoolId/grades")
  async listGrades(@Param("schoolId") schoolId: string): Promise<readonly GradeResponse[]> {
    return this.configuration.listGrades(schoolId)
  }

  @Patch("grades/:id")
  async updateGrade(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<GradeResponse> {
    this.assertWrite(headers)
    return this.configuration.updateGrade(id, parseGradePatch(body))
  }

  @Delete("grades/:id")
  async deleteGrade(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<void> {
    this.assertWrite(headers)
    await this.configuration.deleteGrade(id)
  }

  @Post("grades/:gradeId/classes")
  async createClass(
    @Headers() headers: RequestHeaders,
    @Param("gradeId") gradeId: string,
    @Body() body: unknown,
  ): Promise<ClassResponse> {
    this.assertWrite(headers)
    return this.configuration.createClass(parseClass(body, gradeId))
  }

  @Get("grades/:gradeId/classes")
  async listClasses(@Param("gradeId") gradeId: string): Promise<readonly ClassResponse[]> {
    return this.configuration.listClasses(gradeId)
  }

  @Patch("classes/:id")
  async updateClass(@Headers() headers: RequestHeaders, @Param("id") id: string, @Body() body: unknown): Promise<ClassResponse> {
    this.assertWrite(headers)
    return this.configuration.updateClass(id, parseClassPatch(body))
  }

  @Delete("classes/:id")
  async deleteClass(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<void> {
    this.assertWrite(headers)
    await this.configuration.deleteClass(id)
  }

  @Post("catalog-items")
  async createCatalogItem(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<CatalogItemResponse> {
    this.assertWrite(headers)
    return this.configuration.createCatalogItem(parseCatalogItem(body))
  }

  @Get("catalog-items")
  async listCatalogItems(): Promise<readonly CatalogItemResponse[]> {
    return this.configuration.listCatalogItems()
  }

  @Patch("catalog-items/:id")
  async updateCatalogItem(
    @Headers() headers: RequestHeaders,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<CatalogItemResponse> {
    this.assertWrite(headers)
    return this.configuration.updateCatalogItem(id, parseCatalogItemPatch(body))
  }

  @Delete("catalog-items/:id")
  async deleteCatalogItem(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<void> {
    this.assertWrite(headers)
    await this.configuration.deleteCatalogItem(id)
  }

  @Post("tour-sessions")
  async createTourSession(@Headers() headers: RequestHeaders, @Body() body: unknown): Promise<TourSessionResponse> {
    this.assertWrite(headers)
    return this.configuration.createTourSession(parseTourSession(body))
  }

  @Get("tour-sessions")
  async listTourSessions(): Promise<readonly TourSessionResponse[]> {
    return this.configuration.listTourSessions()
  }

  @Patch("tour-sessions/:id")
  async updateTourSession(
    @Headers() headers: RequestHeaders,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<TourSessionResponse> {
    this.assertWrite(headers)
    return this.configuration.updateTourSession(id, parseTourSessionPatch(body))
  }

  @Delete("tour-sessions/:id")
  async deleteTourSession(@Headers() headers: RequestHeaders, @Param("id") id: string): Promise<void> {
    this.assertWrite(headers)
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

  private assertWrite(headers: RequestHeaders): void {
    this.staffAccess.assertConfigurationWrite(this.staffAccess.resolve(headers))
  }
}

type RequestHeaders = Record<string, string | readonly string[] | undefined>
