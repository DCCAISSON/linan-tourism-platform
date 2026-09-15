const databaseUrl = process.env.DATABASE_URL

if (databaseUrl === undefined || databaseUrl.length === 0) {
  console.error("Missing required environment variable: DATABASE_URL")
  process.exit(1)
}

console.log("Required environment variable is set: DATABASE_URL")
