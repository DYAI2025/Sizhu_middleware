/**
 * Authenticated client for the Sizhu middleware /api.
 *
 * SECURITY MODEL (deliberate): this client is a thin proxy that FORWARDS the
 * caller's own Sizhu access token (admin + MFA/aal2 — supplied as the inbound MCP
 * request's Authorization bearer) to the downstream /api. It holds NO static admin
 * secret of its own. Therefore the MCP server adds NO privilege and can bypass
 * NOTHING: every server-side guard (the default-deny apiGuard, the `sensitive`
 * role+MFA classification, and the human-approval-before-live-dispatch invariant
 * `assertDispatchAllowed`) is enforced by /api exactly as for a direct caller.
 * The token is never logged or echoed.
 */

const DEFAULT_TIMEOUT_MS = 30_000;

export class SizhuApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "SizhuApiError";
  }
}

export class SizhuClient {
  /**
   * @param baseUrl Sizhu deployment base, e.g. https://sizhu.fufire.space (NO trailing /api).
   * @param token   the caller's Sizhu access token (admin+aal2), forwarded downstream. Never logged.
   */
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  /** A short, secret-free description of the target (host only) for diagnostics. */
  get host(): string {
    try {
      return new URL(this.baseUrl).host;
    } catch {
      return "<invalid SIZHU_BASE_URL>";
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          // Forward the caller's token verbatim — this is the ONLY credential used.
          Authorization: `Bearer ${this.token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (e?.name === "AbortError") {
        throw new SizhuApiError(`Request to Sizhu timed out after ${DEFAULT_TIMEOUT_MS}ms`, 0);
      }
      throw new SizhuApiError(`Network error reaching Sizhu (${this.host}): ${e?.message ?? err}`, 0);
    } finally {
      clearTimeout(timeout);
    }

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }

    if (!res.ok) {
      // Map to actionable messages (never leak the token; the body may carry a controlled error_code).
      throw new SizhuApiError(this.explain(res.status, parsed), res.status, parsed);
    }
    return parsed as T;
  }

  private explain(status: number, body: unknown): string {
    const code = (body as { error_code?: string })?.error_code;
    const msg = (body as { message?: string; reason?: string })?.message
      ?? (body as { reason?: string })?.reason;
    switch (status) {
      case 401:
        return "401 Unauthorized — the forwarded Sizhu token is missing/invalid/expired or the email is unverified. Re-authenticate to Sizhu (admin account, MFA/aal2) and supply a fresh access token as the MCP Authorization bearer.";
      case 403:
        return `403 Forbidden — ${code ?? "this action requires admin role + MFA (aal2)"}. The forwarded token lacks the required role or AAL. (Human-approval-gated actions are intentionally not bypassable.)`;
      case 404:
        return "404 Not Found — that operation/route is not served by this Sizhu deployment (it may be a pipeline endpoint that is not yet wired server-side).";
      case 429:
        return "429 Rate limited — wait before retrying.";
      case 503:
        return `503 Not Ready — ${msg ?? "the service or a required secret/config is not present"}.`;
      default:
        return `Sizhu /api error (HTTP ${status})${code ? ` [${code}]` : ""}${msg ? `: ${msg}` : ""}`;
    }
  }
}
