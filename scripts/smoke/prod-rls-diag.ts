/**
 * Decisive prod-key diagnosis: is SECRET_REF_SUPABASE_SERVICE_ROLE the real service_role key
 * (RLS-bypass, reads+writes) or a wrong/anon key (RLS-limited → reads empty, writes 500)?
 * Inserts a probe row via the pooler (RLS-independent), then asks prod /api whether it sees it,
 * and tries a prod write — then cleans up.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { signJwtHS256 } from "../../server/lib/jwt";

const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const g = (k: string) => env.split("\n").find((l) => l.startsWith(k + "="))?.slice(k.length + 1).trim().replace(/^["']|["']$/g, "") ?? "";
const uri = g("POSTGRES_URI") || g("POSTGRGES_URI");
const u = new URL(uri);
const ref = u.hostname.match(/^db\.([a-z0-9]+)\./)?.[1];
const conn = ref ? `postgresql://postgres.${ref}:${u.password}@aws-1-eu-central-1.pooler.supabase.com:6543/postgres` : uri;
const token = signJwtHS256({ sub: "diag", email: g("ADMIN_EMAIL_ALLOWLIST").split(",")[0], aal: "aal2", email_confirmed_at: "2024-01-01T00:00:00Z", exp: Math.floor(Date.now() / 1000) + 300 }, g("SUPABASE_JWT_SECRET"));
const P = "https://sizhu.fufire.space";
const h = { Authorization: `Bearer ${token}` };
const id = `rlsdiag_${process.pid}`;

const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("INSERT INTO shop_products (id, shop_provider, external_product_id, title) VALUES ($1,'Etsy','e','RLS Probe') ON CONFLICT (id) DO NOTHING", [id]);
console.log("pooler: inserted probe row", id);

const rGet = await fetch(`${P}/api/v1/products`, { headers: h });
const list = (await rGet.json()) as Array<{ id: string }>;
const sees = Array.isArray(list) && list.some((p) => p.id === id);
console.log(`prod GET /api/v1/products → ${rGet.status}, sees probe row: ${sees ? "YES (key has read access → RLS-bypass/service_role)" : "NO (RLS hides it → key is NOT service_role)"}`);

const rPost = await fetch(`${P}/api/v1/products`, { method: "POST", headers: { "Content-Type": "application/json", ...h }, body: JSON.stringify([{ id: `${id}_w`, shopProvider: "Etsy", externalProductId: "e", title: "w", productType: "poster", isActive: true, activeTemplateId: null }]) });
console.log(`prod POST → ${rPost.status} ${(await rPost.text()).slice(0, 120)}`);

await c.query("DELETE FROM shop_products WHERE id = $1 OR id = $2", [id, `${id}_w`]);
await c.end();
console.log("cleanup done");
console.log(`\nVERDICT: ${sees ? "key READS (service_role-ish); write-500 needs the POST body above" : "WRONG KEY — set SECRET_REF_SUPABASE_SERVICE_ROLE to the real service_role secret"}`);
