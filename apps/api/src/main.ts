import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module.js"

const DEFAULT_PORT = 3000

async function bootstrap(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"]
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    console.error("Missing required environment variable: DATABASE_URL")
    process.exit(1)
  }

  const app = await NestFactory.create(AppModule)
  await app.listen(process.env["PORT"] ?? DEFAULT_PORT)
}

await bootstrap()
