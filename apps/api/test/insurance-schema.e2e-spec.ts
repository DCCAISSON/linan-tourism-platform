import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { closeCatalogTripDatabase, databaseUrl, dataSource, initializeCatalogTripDatabase } from "./catalog-trip-fixture.js"

describe.skipIf(databaseUrl === undefined)("insurance plan additive MySQL migration", () => {
  beforeAll(initializeCatalogTripDatabase)
  afterAll(closeCatalogTripDatabase)

  it("adds nullable JSON columns, reverts them, and reruns only the reverted migration", async () => {
    // Given
    const columns = () => dataSource.query("select table_name as tableName,column_name as columnName,data_type as dataType,is_nullable as nullable from information_schema.columns where table_schema=database() and ((table_name='tour_sessions' and column_name='insurance_plan_json') or (table_name='insurance_batches' and column_name='plan_snapshot_json')) order by table_name")
    const expected = [
      { tableName: "insurance_batches", columnName: "plan_snapshot_json", dataType: "json", nullable: "YES" },
      { tableName: "tour_sessions", columnName: "insurance_plan_json", dataType: "json", nullable: "YES" },
    ]
    expect(await columns()).toEqual(expected)
    expect(await dataSource.runMigrations()).toEqual([])
    // When
    await dataSource.undoLastMigration()
    // Then
    expect(await columns()).toEqual([])
    expect((await dataSource.runMigrations()).map((migration) => migration.name)).toEqual(["AddInsurancePlans1766025000000"])
    expect(await columns()).toEqual(expected)
    expect(await dataSource.runMigrations()).toEqual([])
  })
})
