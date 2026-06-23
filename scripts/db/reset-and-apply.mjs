/**
 * Definitive A+B fix: some app tables pre-existed in an INCOMPLETE form (e.g. shop_products
 * lacked created_at), so CREATE TABLE IF NOT EXISTS skipped them and the repos break on
 * missing columns. This script, via the transaction pooler:
 *   1. checks every schema table's row count,
 *   2. ABORTS (surfaces) if any pre-existing table holds REAL data (never silently drop data),
 *   3. else DROP TABLE IF EXISTS … CASCADE for each + re-applies the full schema (atomic),
 *   4. NOTIFY pgrst reload schema.
 * --force re-applies even if some tables have rows (still never used here without consent).
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const line = env.split("\n").find((l) => /^POSTGRGES_URI=|^POSTGRES_URI=/.test(l));
if (!line) throw new Error("POSTGRGES_URI not found");
const uri = line.replace(/^[^=]+=/, "").trim().replace(/^["']|["']$/g, "");
const u = new URL(uri);
const ref = u.hostname.match(/^db\.([a-z0-9]+)\./)?.[1];
const conn = ref ? `postgresql://postgres.${ref}:${u.password}@aws-1-eu-central-1.pooler.supabase.com:6543/postgres` : uri;

const SQL = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
const tables = [...SQL.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s*\(/gi)].map((m) => m[1]);
const FORCE = process.argv.includes("--force");

const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();
console.log(`connected. schema defines ${tables.length} tables. checking row counts…`);

const nonEmpty = [];
for (const t of tables) {
  try {
    const r = await c.query(`SELECT count(*)::int n FROM "${t}"`);
    if (r.rows[0].n > 0) nonEmpty.push(`${t}(${r.rows[0].n})`);
  } catch { /* table doesn't exist yet — fine */ }
}
if (nonEmpty.length && !FORCE) {
  console.log("ABORT — these existing tables hold rows (re-run with --force to drop anyway):", nonEmpty.join(", "));
  await c.end();
  process.exit(2);
}
console.log(nonEmpty.length ? `--force: dropping despite rows in ${nonEmpty.join(", ")}` : "all existing tables empty — safe to recreate.");

try {
  await c.query("BEGIN");
  // Drop in reverse so CASCADE has less work; CASCADE handles FK order anyway.
  for (const t of [...tables].reverse()) await c.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
  await c.query(SQL);
  await c.query("COMMIT");
  console.log(`✓✓ RESET + SCHEMA APPLIED (${tables.length} tables, RLS, functions) — committed.`);
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  console.log("FAIL:", e.code, e.message);
  process.exitCode = 1;
}
await c.query("NOTIFY pgrst, 'reload schema'").catch(() => {});
await c.end();
