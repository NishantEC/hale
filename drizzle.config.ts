import type { Config } from "drizzle-kit"

export default {
  schema: "./app/services/db/schema.ts",
  out: "./app/services/db/migrations",
  dialect: "sqlite",
  driver: "expo",
} satisfies Config
