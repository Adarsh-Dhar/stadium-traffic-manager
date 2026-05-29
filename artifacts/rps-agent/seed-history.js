/**
 * Seed historical game baseline data into PostgreSQL.
 * Run once:  node seed-history.js
 */

import dotenv from "dotenv";
dotenv.config();

const PG_URL = process.env.DATABASE_URL || process.env.PG_URL ||
  "postgresql://postgres:postgres@localhost:5432/stadium";

const ROWS = [
  {
    game_type:                "low_stakes_game",
    baseline_rps:             120,
    peak_rps:                 350,
    severity_multiplier:      1.0,
    avg_fan_arrival_minutes:  45,
    notes:                    "Group stage, low attendance, midweek afternoon",
  },
  {
    game_type:                "regular_game",
    baseline_rps:             280,
    peak_rps:                 820,
    severity_multiplier:      1.4,
    avg_fan_arrival_minutes:  60,
    notes:                    "Round of 16, weekend, full stadium expected",
  },
  {
    game_type:                "playoff_game",
    baseline_rps:             650,
    peak_rps:                 2100,
    severity_multiplier:      2.1,
    avg_fan_arrival_minutes:  90,
    notes:                    "Quarter-final or beyond, max media + fan load",
  },
];

async function main() {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: PG_URL });
  await client.connect();
  console.log("[seed] Connected to PostgreSQL");

  await client.query(`
    CREATE TABLE IF NOT EXISTS game_history (
      id                      SERIAL PRIMARY KEY,
      game_type               TEXT UNIQUE NOT NULL,
      baseline_rps            INTEGER NOT NULL,
      peak_rps                INTEGER NOT NULL,
      severity_multiplier     NUMERIC(4,2) NOT NULL,
      avg_fan_arrival_minutes INTEGER NOT NULL,
      notes                   TEXT,
      created_at              TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log("[seed] Table game_history ready");

  for (const row of ROWS) {
    await client.query(
      `INSERT INTO game_history
         (game_type, baseline_rps, peak_rps, severity_multiplier, avg_fan_arrival_minutes, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (game_type) DO UPDATE
         SET baseline_rps             = EXCLUDED.baseline_rps,
             peak_rps                 = EXCLUDED.peak_rps,
             severity_multiplier      = EXCLUDED.severity_multiplier,
             avg_fan_arrival_minutes  = EXCLUDED.avg_fan_arrival_minutes,
             notes                    = EXCLUDED.notes`,
      [row.game_type, row.baseline_rps, row.peak_rps,
       row.severity_multiplier, row.avg_fan_arrival_minutes, row.notes]
    );
    console.log(`[seed] Upserted: ${row.game_type}`);
  }

  await client.end();
  console.log("[seed] Done ✓");
}

main().catch(e => { console.error(e); process.exit(1); });
