/**
 * Apply supabase-schema.sql (tables + RLS) to the live Postgres via POSTGRGES_URI.
 * Idempotent + safe to re-run: statements are split dollar-quote-aware, executed one by
 * one, and "already exists"/duplicate errors are SKIPPED (logged) — only a genuinely new
 * error aborts. Run: `node scripts/db/apply-schema.mjs` (reads .env).
 *
 * It does NOT drop anything. CREATE TABLE IF NOT EXISTS preserves existing tables/data
 * (prompt_templates, bazi_*). CREATE POLICY has no IF NOT EXISTS in Postgres, so a re-run
 * lands on the duplicate-skip path.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const dotenv = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const URI = dotenv
  .split("\n")
  .find((l) => /^POSTGRGES_URI=|^POSTGRES_URI=/.test(l))
  ?.replace(/^[^=]+=/, "")
  .trim()
  .replace(/^["']|["']$/g, "");
if (!URI) throw new Error("POSTGRGES_URI not found in .env");

// The direct `db.<ref>.supabase.co` host is IPv6/deprecated and does not resolve from
// restricted networks — rewrite it to the shared TRANSACTION POOLER (port 6543,
// user `postgres.<ref>`, region aws-1-eu-central-1) which is reachable over IPv4.
function toPooler(uri) {
  const u = new URL(uri);
  const m = u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (!m) return uri;
  return `postgresql://postgres.${m[1]}:${u.password}@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`;
}
const CONN = toPooler(URI);

const SQL = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");

// Split top-level statements, respecting dollar-quotes / strings / comments.
function split(sql) {
  const out = [];
  let cur = "", i = 0;
  let single = false, dbl = false, dollar = null, line = false, block = false;
  while (i < sql.length) {
    const ch = sql[i], nx = sql[i + 1];
    if (line) { cur += ch; if (ch === "\n") line = false; i++; continue; }
    if (block) { cur += ch; if (ch === "*" && nx === "/") { cur += nx; i += 2; block = false; continue; } i++; continue; }
    if (dollar) { if (sql.startsWith(dollar, i)) { cur += dollar; i += dollar.length; dollar = null; continue; } cur += ch; i++; continue; }
    if (single) { cur += ch; if (ch === "'") single = false; i++; continue; }
    if (dbl) { cur += ch; if (ch === '"') dbl = false; i++; continue; }
    if (ch === "-" && nx === "-") { line = true; cur += ch; i++; continue; }
    if (ch === "/" && nx === "*") { block = true; cur += ch; i++; continue; }
    if (ch === "'") { single = true; cur += ch; i++; continue; }
    if (ch === '"') { dbl = true; cur += ch; i++; continue; }
    if (ch === "$") { const m = sql.slice(i).match(/^\$[A-Za-z_0-9]*\$/); if (m) { dollar = m[0]; cur += dollar; i += dollar.length; continue; } }
    if (ch === ";") { cur += ch; out.push(cur.trim()); cur = ""; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((s) => s && !/^--/.test(s) && s !== ";");
}

const SKIP = new Set(["42P07", "42710", "42P06", "42723", "23505", "42701", "42P16"]); // duplicate_* / unique_violation

const stmts = split(SQL);
const client = new pg.Client({ connectionString: CONN, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log(`connected. applying ${stmts.length} statements…`);
let ok = 0, skipped = 0;
const errors = [];
for (const s of stmts) {
  const label = s.slice(0, 70).replace(/\s+/g, " ");
  try {
    await client.query(s);
    ok++;
  } catch (e) {
    if (SKIP.has(e.code)) { skipped++; }
    else { errors.push({ code: e.code, msg: e.message, label }); }
  }
}
await client.end();
console.log(`\nDONE: ${ok} applied, ${skipped} skipped (already exist), ${errors.length} real errors`);
if (errors.length) { console.log("REAL ERRORS:"); errors.forEach((e) => console.log(`  [${e.code}] ${e.msg}  @ ${e.label}`)); process.exit(1); }
