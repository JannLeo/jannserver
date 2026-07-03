import { db, sqlite } from "./index";
import { users, notes, tasks, memos, dailyPages, projects, folders } from "./schema";
import { hashPassword } from "../auth";

export async function seedDatabase() {
  const existing = db.select().from(users).all();
  if (existing.length > 0) {
    console.log("Admin user already exists, skipping seed.");
    return;
  }

  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const hash = await hashPassword(password);

  db.insert(users).values({ username, passwordHash: hash }).run();
  console.log(`Admin user created: ${username}`);

  const rootFolder = db.insert(folders).values({ name: "root" }).returning().get();
  console.log(`Root folder created: ${rootFolder?.name}`);
}
