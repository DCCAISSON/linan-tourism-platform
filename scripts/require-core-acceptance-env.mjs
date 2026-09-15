if (!process.env.DOMAIN_TEST_DATABASE_URL) {
  console.error("Core acceptance requires DOMAIN_TEST_DATABASE_URL; database-backed API tests were not run.")
  process.exit(1)
}
