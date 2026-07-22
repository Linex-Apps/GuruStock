/**
 * Backfill Script — clears placeholder trades and re-ingests with real 13F data.
 *
 * Usage: bun run server/scripts/backfill.ts
 *
 * This script:
 *  1. Deletes all trades with confidence = 'estimated' (placeholder data)
 *  2. Deletes all trades with confidence = 'confirmed' (so we get fresh data)
 *  3. Re-runs ingestAllGurus() to populate with real parsed 13F data
 */
import { sql } from "../db";
import { ingestAllGurus } from "../lib/ingest";

async function backfill() {
  console.log("=== GuruStock 13F Backfill ===\n");

  if (!sql) {
    console.error("Database not available. Check DATABASE_URL.");
    process.exit(1);
  }

  // 1. Show current state
  const [statsBefore] = await sql`
    SELECT confidence, COUNT(*) as count
    FROM trades
    GROUP BY confidence
  `;
  console.log("Current trades in database:");

  let allStats: any[];
  try {
    allStats = await sql`
      SELECT confidence, COUNT(*)::int as count
      FROM trades
      GROUP BY confidence
    `;
    for (const row of allStats) {
      console.log(`  ${row.confidence}: ${row.count} trades`);
    }
  } catch {
    console.log("  (no trades table or empty)");
  }

  // 2. Delete placeholder trades
  console.log("\nDeleting placeholder (estimated) trades...");
  try {
    const delResult = await sql`
      DELETE FROM trades WHERE confidence = 'estimated'
    `;
    console.log(`  Deleted placeholder trades.`);
  } catch (err) {
    console.error("  Failed to delete placeholder trades:", err);
  }

  // NOTE: We do NOT clear confirmed trades — dedup via ON CONFLICT handles re-ingestion.
  // Only placeholder data is purged so real 13F data can take its place.

  // 3. Re-ingest with real data
  console.log("\nRe-ingesting with real 13F data...");
  const results = await ingestAllGurus();

  console.log("\n--- Ingestion Results ---");
  for (const result of results) {
    console.log(`  ${result.guru}: ${result.inserted} inserted, ${result.skipped} skipped, ${result.fetched} fetched`);
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.log(`    ERROR: ${err}`);
      }
    }
  }

  // 4. Show final state
  console.log("\nFinal trades in database:");
  try {
    const finalStats = await sql`
      SELECT confidence, COUNT(*)::int as count
      FROM trades
      GROUP BY confidence
    `;
    for (const row of finalStats) {
      console.log(`  ${row.confidence}: ${row.count} trades`);
    }
  } catch (err) {
    console.error("  Could not query final stats:", err);
  }

  // 5. Show sample trades
  console.log("\nSample confirmed trades:");
  try {
    const samples = await sql`
      SELECT t.ticker, t.company_name, t.shares, t.price_estimate, t.filing_date, g.name as guru_name
      FROM trades t
      JOIN gurus g ON t.guru_id = g.id
      WHERE t.confidence = 'confirmed'
      ORDER BY t.filing_date DESC
      LIMIT 10
    `;
    for (const row of samples) {
      console.log(`  ${row.guru_name} | ${row.ticker} | ${row.company_name} | ${row.shares} shares | $${row.price_estimate} | ${row.filing_date}`);
    }
  } catch (err) {
    console.error("  Could not fetch samples:", err);
  }

  console.log("\n=== Backfill Complete ===");
}

// Allow running directly: bun run server/scripts/backfill.ts
// Check if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("backfill.ts");

if (isMainModule) {
  backfill()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Backfill failed:", err);
      process.exit(1);
    });
}

export { backfill };
