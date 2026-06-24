/**
 * Apply supabase-schema.sql as ONE multi-statement query via the transaction pooler.
 * Postgres parses dollar-quoted functions correctly (unlike a hand-rolled splitter).
 * The simple-query protocol wraps it in an implicit transaction → atomic (all-or-nothing),
 * so a duplicate-object error rolls everything back cleanly. CREATE TABLE IF NOT EXISTS +
 * CREATE OR REPLACE FUNCTION are idempotent; CREATE POLICY is not — so on a re-run we
 * first DROP every policy the schema defines, then re-create (makes the whole apply re-runnable).
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const uri = env.split("\n").find((l) => /^POSTGRGES_URI=|^POSTGRES_URI=/.test(l))?.replace(/^[^=]+=/, "").trim().replace(/^["']|["']$/g, "");
const u = new URL(uri);
const ref = u.hostname.match(/^db\.([a-z0-9]+)\./)?.[1];
const conn = ref
  ? `postgresql://postgres.${ref}:${u.password}@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`
  : uri;

const SQL = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();
// Re-runnable: drop EXISTING policies (only those whose table exists → DROP is valid),
// so the schema's non-idempotent CREATE POLICY statements don't collide on a re-apply.
const existing = await client.query("SELECT policyname, tablename FROM pg_policies WHERE schemaname='public'");
console.log(`connected via pooler. dropping ${existing.rows.length} existing policies, then applying schema…`);
try {
  await client.query("BEGIN");
  for (const p of existing.rows) await client.query(`DROP POLICY IF EXISTS "${p.policyname}" ON "${p.tablename}";`);
  await client.query(SQL);
  await client.query("COMMIT");
  console.log("✓✓ SCHEMA + RLS APPLIED (committed).");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.log("FAIL:", e.code, e.message);
  console.log("  position:", e.position, e.where ?? "");
  process.exitCode = 1;
}
await client.end();
