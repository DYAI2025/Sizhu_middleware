const SECRET_ENV_NAME_PATTERN = /(SECRET|TOKEN|API_KEY|SERVICE_ROLE|JWT|PASSWORD|PRIVATE_KEY)/i;

function collectSecretValues(env: NodeJS.ProcessEnv): string[] {
  return Object.entries(env)
    .filter(([key, value]) => SECRET_ENV_NAME_PATTERN.test(key) && typeof value === "string" && value.length >= 8)
    .map(([, value]) => value as string);
}

function redactString(value: string, secrets: string[]): string {
  let current = value;
  for (const secret of secrets) {
    if (secret && current.includes(secret)) {
      current = current.split(secret).join("[REDACTED]");
    }
  }
  return current;
}

export function sanitizeForMcpResponse<T>(input: T, env: NodeJS.ProcessEnv = process.env): T {
  const secrets = collectSecretValues(env);
  const seen = new WeakMap<object, unknown>();

  function visit(value: unknown): unknown {
    if (typeof value === "string") return redactString(value, secrets);
    if (typeof value !== "object" || value === null) return value;
    if (seen.has(value)) return seen.get(value as object);
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      seen.set(value, out);
      for (const item of value) out.push(visit(item));
      return out;
    }
    const out: Record<string, unknown> = {};
    seen.set(value as object, out);
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = visit(child);
    }
    return out;
  }

  return visit(input) as T;
}

export function assertNoKnownSecrets(serializable: unknown, env: NodeJS.ProcessEnv = process.env): void {
  const serialized = JSON.stringify(serializable);
  for (const secret of collectSecretValues(env)) {
    if (serialized.includes(secret)) {
      throw new Error("MCP response sanitizer failed: known secret value is present in response.");
    }
  }
}
