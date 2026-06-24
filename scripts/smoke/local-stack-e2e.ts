/**
 * Local FULL-STACK end-to-end against the running dev server (SUPABASE_READY) + live DB.
 * Mints a real HS256 session token (as Supabase would), hits the actual /api routes through
 * the real apiGuard, which drive the service-role repos against the live Postgres.
 *   PORT=3055 npm run dev  (separately)  then:  tsx scripts/smoke/local-stack-e2e.ts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { signJwtHS256 } from "../../server/lib/jwt";

const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const get = (k: string) => env.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim().replace(/^["']|["']$/g, "") ?? "";
const SECRET = get("SUPABASE_JWT_SECRET");
const EMAIL = get("ADMIN_EMAIL_ALLOWLIST").split(",")[0];
const URL_ = get("SUPABASE_URL") || get("VITE_SUPABASE_URL");
const KEY = process.env[get("SUPABASE_SERVICE_ROLE_SECRET_REF") || "SECRET_REF_SUPABASE_SERVICE_ROLE"] || get("SECRET_REF_SUPABASE_SERVICE_ROLE");
const BASE = "http://127.0.0.1:3055";

const token = signJwtHS256(
  { sub: "local-e2e", email: EMAIL, aal: "aal2", email_confirmed_at: "2024-01-01T00:00:00Z", exp: Math.floor(Date.now() / 1000) + 600 },
  SECRET,
);
const auth = { Authorization: `Bearer ${token}` };
const results: string[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`); console.log(results[results.length - 1]); };

async function main() {
  console.log(`E2E vs ${BASE} (SUPABASE_READY), email=${EMAIL}`);

  // 1. apiGuard: no token → 401
  const r401 = await fetch(`${BASE}/api/v1/products`);
  check("apiGuard rejects no-token (401)", r401.status === 401, `got ${r401.status}`);

  // 2. authed GET products → 200 array (live, empty)
  const rGet = await fetch(`${BASE}/api/v1/products`, { headers: auth });
  const list = rGet.ok ? await rGet.json() : null;
  check("GET /api/v1/products authed → 200 array", rGet.status === 200 && Array.isArray(list), `status ${rGet.status}`);

  // 3. POST a product → 200, then GET sees it (full route → service-role → live shop_products)
  const id = `e2e_prod_${process.pid}`;
  const product = { id, shopProvider: "Etsy", externalProductId: "ext-e2e", title: "E2E Product", productType: "poster", isActive: true, activeTemplateId: null };
  const rPost = await fetch(`${BASE}/api/v1/products`, { method: "POST", headers: { "Content-Type": "application/json", ...auth }, body: JSON.stringify([product]) });
  check("POST /api/v1/products → 200", rPost.status === 200, `status ${rPost.status}`);
  const rGet2 = await fetch(`${BASE}/api/v1/products`, { headers: auth });
  const list2 = await rGet2.json();
  check("posted product round-trips through the live DB", Array.isArray(list2) && list2.some((p: { id: string; title: string }) => p.id === id && p.title === "E2E Product"));

  // 4. another domain via the real route
  const rWf = await fetch(`${BASE}/api/v1/workflow-runs`, { headers: auth });
  check("GET /api/v1/workflow-runs authed → 200", rWf.status === 200, `status ${rWf.status}`);
  const rRoles = await fetch(`${BASE}/api/v1/roles`, { headers: auth }).catch(() => null);
  if (rRoles) check("GET /api/v1/roles authed (seeded RBAC)", rRoles.status === 200, `status ${rRoles.status}`);

  // cleanup
  if (URL_ && KEY) await createClient(URL_, KEY, { auth: { persistSession: false } }).from("shop_products").delete().eq("id", id);
  console.log("cleanup: removed e2e product");

  const failed = results.filter((r) => r.startsWith("✗"));
  console.log(`\nLOCAL E2E: ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
