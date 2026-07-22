import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn("DATABASE_URL not set — database features disabled");
}

// Neon HTTP driver for queries (serverless-optimized)
export const sql = DATABASE_URL ? neon(DATABASE_URL) : null;

// pg Pool for DDL migrations (reliable TCP-based DDL execution)
export async function runMigrations(): Promise<void> {
  if (!DATABASE_URL) {
    console.warn("Skipping migrations: no DATABASE_URL");
    return;
  }

  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const dbDir = import.meta.dir;
    // Run all .sql files in the db directory, sorted alphabetically
    const files = readdirSync(dbDir)
      .filter((f: string) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const filePath = join(dbDir, file);
      const sqlContent = readFileSync(filePath, "utf-8");
      await pool.query(sqlContent);
      console.log(`Migration ${file} applied successfully`);
    }
    console.log("All database migrations applied successfully");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}
