import process from "node:process"

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required")
}

if (process.env.NODE_ENV !== "test") {
  throw new Error("db:seed:test requires NODE_ENV=test")
}

const { DOMAIN_POLICY_VERSION, TOUR_SESSION_STATUS } = await import("@linan/contracts")
const { createDomainDataSource } = await import("../dist/domain/data-source.js")
const dataSource = createDomainDataSource(databaseUrl)

try {
  await dataSource.initialize()
  await dataSource.transaction(async (manager) => {
    await manager.query(
      "INSERT INTO organizations (id, code, name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
      ["org-test-seed", "org-test-seed", "Linan Fictitious Test Organization"],
    )
    await manager.query(
      "INSERT INTO catalog_items (id, organization_id, code, title, status, policy_version) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), policy_version = VALUES(policy_version)",
      [
        "catalog-test-seed",
        "org-test-seed",
        "catalog-test-seed",
        "Fictitious Test Course",
        "active",
        DOMAIN_POLICY_VERSION,
      ],
    )
    await manager.query(
      "INSERT INTO tour_sessions (id, organization_id, catalog_item_id, code, status, price_fen, capacity, starts_at, ends_at, policy_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE price_fen = VALUES(price_fen), capacity = VALUES(capacity), policy_version = VALUES(policy_version)",
      [
        "session-test-seed",
        "org-test-seed",
        "catalog-test-seed",
        "session-test-seed",
        TOUR_SESSION_STATUS.published,
        12_345,
        20,
        new Date("2026-10-01T01:00:00.000Z"),
        new Date("2026-10-01T09:00:00.000Z"),
        DOMAIN_POLICY_VERSION,
      ],
    )
  })
  console.log(JSON.stringify({ seeded: ["organization", "catalog_item", "tour_session"] }))
} finally {
  if (dataSource.isInitialized) {
    await dataSource.destroy()
  }
}
