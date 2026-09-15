import process from "node:process"

const databaseUrl = process.env.DATABASE_URL
const command = process.argv[2]

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required")
}

if (command !== "migrate" && command !== "revert") {
  throw new Error("database command must be migrate or revert")
}

const { createDomainDataSource } = await import("../dist/domain/data-source.js")
const dataSource = createDomainDataSource(databaseUrl)

try {
  await dataSource.initialize()

  if (command === "migrate") {
    const migrations = await dataSource.runMigrations()
    console.log(JSON.stringify({ command, migrations: migrations.map(({ name }) => name) }))
  } else {
    await dataSource.undoLastMigration()
    console.log(JSON.stringify({ command }))
  }
} finally {
  if (dataSource.isInitialized) {
    await dataSource.destroy()
  }
}
