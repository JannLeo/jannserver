import type { Config } from "drizzle-kit";
import * as path from "path";
export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH || "./data/app.db",
  },
} satisfies Config;
