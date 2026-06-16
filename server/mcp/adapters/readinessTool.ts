export interface ReadinessStatus {
  status: "READY" | "NOT_READY";
  missing?: string[];
}

export function getReadinessStatus(env: NodeJS.ProcessEnv = process.env): ReadinessStatus {
  const fuFireSecretRef = env.FUFIRE_API_KEY_SECRET_REF || "SECRET_REF_FUFIRE_API_KEY";
  const supabaseSecretRef = env.SUPABASE_SERVICE_ROLE_SECRET_REF || "SECRET_REF_SUPABASE_SERVICE_ROLE";
  const requiredEnvVars = [fuFireSecretRef, supabaseSecretRef, "FUFIRE_BASE_URL", "SUPABASE_URL"];
  const missing = requiredEnvVars.filter((key) => !env[key]);
  if (missing.length === 0) return { status: "READY" };
  return { status: "NOT_READY", missing };
}
