import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AddCatalogContent1765911600000 } from "../src/migrations/1765911600000-AddCatalogContent.js"
import {
  closeCatalogTripDatabase, createScope, dataSource, databaseUrl,
  initializeCatalogTripDatabase, resetCatalogTripData,
} from "./catalog-trip-fixture.js"

describe.skipIf(databaseUrl === undefined)("Additive catalog content migration", () => {
  beforeAll(initializeCatalogTripDatabase)
  afterAll(closeCatalogTripDatabase)

  it("preserves existing catalog rows and core values through down and up", async () => {
    const scope = createScope()
    const migration = new AddCatalogContent1765911600000()
    const runner = dataSource.createQueryRunner()
    await runner.connect()
    let contentSchemaPresent = true
    try {
      await runner.query("insert into organizations (id,code,name) values (?,?,?)", [scope, `school-${scope}`, "迁移验证学校"])
      await runner.query("insert into catalog_items (id,organization_id,code,title,status,policy_version) values (?,?,?,?,?,?)", [
        scope, scope, `catalog-${scope}`, "迁移前活动", "active", "migration-fictional-policy",
      ])
      const coreSql = "select id,organization_id,code,title,status,policy_version,created_at,updated_at from catalog_items order by id"
      const before = await runner.query(coreSql)
      await migration.down(runner)
      contentSchemaPresent = false
      expect(await runner.query(coreSql)).toEqual(before)
      await migration.up(runner)
      contentSchemaPresent = true
      expect(await runner.query(coreSql)).toEqual(before)
      const rows = await runner.query("select description,cover_image_url from catalog_items where id = ?", [scope])
      expect(rows).toEqual([{ description: "", cover_image_url: "" }])
      const drift = await dataSource.driver.createSchemaBuilder().log()
      expect(drift.upQueries).toHaveLength(0)
      expect(drift.downQueries).toHaveLength(0)
    } finally {
      if (!contentSchemaPresent) await migration.up(runner)
      await runner.release()
      await resetCatalogTripData(scope)
    }
  })
})
