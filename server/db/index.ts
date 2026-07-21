import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import { readFileSync } from "fs";
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
    const schemaPath = join(import.meta.dir, "schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");
    await pool.query(schema);
    console.log("Database schema applied successfully");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await pool.end();
  }
}
