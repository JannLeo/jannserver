import { db, sqlite } from "./db/index";
import { users, folders } from "./db/schema";
import bcrypt from "bcryptjs";

async function main() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  const existing = db.select().from(users).all();
  if (existing.length > 0) {
    console.log("Admin already exists. Username:", existing[0].username);
    process.exit(0);
  }

  const hash = await bcrypt.hash(password, 12);
  db.insert(users).values({ username, passwordHash: hash }).run();
  db.insert(folders).values({ name: "root" }).run();
  console.log("Admin created:", username);
  process.exit(0);
}

main().catch((e) => {
  console.error("Init failed:", e);
  process.exit(1);
});
