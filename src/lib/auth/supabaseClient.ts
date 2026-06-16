import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseAllowlist } from "./parseAllowlist";

/**
 * Browser Supabase client.
 *
 * SECURITY: the frontend is only ever allowed to use the public anon key. The
 * privileged server-only key MUST NOT appear in this bundle. Vite only exposes
 * variables prefixed with `VITE_`, which is why we read VITE_SUPABASE_URL /
 * VITE_SUPABASE_ANON_KEY here and never any privileged server credential.
 */

interface ViteEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_ADMIN_EMAIL_ALLOWLIST?: string;
}

function readEnv(): ViteEnv {
  try {
    // import.meta.env is replaced at build time by Vite.
    return ((import.meta as unknown as { env?: ViteEnv }).env || {}) as ViteEnv;
  } catch {
    return {};
  }
}

const env = readEnv();

export const SUPABASE_URL = env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || "";

/** Display-only allowlist used to render the expected role in the UI. The real
 * authorization decision is always made server-side. */
export const ADMIN_EMAIL_ALLOWLIST = parseAllowlist(env.VITE_ADMIN_EMAIL_ALLOWLIST);

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

/**
 * Returns the singleton Supabase client, or null when the app has not been
 * configured with Supabase credentials yet (e.g. local demo mode). Callers must
 * handle the null case so the console still renders without Supabase.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
