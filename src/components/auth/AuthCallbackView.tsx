import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { getSupabaseClient } from "../../lib/auth/supabaseClient";

/**
 * AuthCallbackView — landing target for `/auth/callback`.
 *
 * Supabase sends PKCE magic-link redirects with a ?code= query parameter.
 * We must explicitly exchange that code for a session before redirecting
 * back to the app, because the GoTrue client's automatic URL detection
 * (detectSessionInUrl / _initialize) may not have completed before the first
 * render.  If we redirect before the session settles the exchange is aborted
 * and the user is left logged out on the target page.
 */
export default function AuthCallbackView() {
  const [message, setMessage] = useState("Completing sign-in…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const client = getSupabaseClient();
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    const run = async () => {
      try {
        const params = new URLSearchParams(window.location.search);

        // 1. PKCE code from Supabase magic-link redirect
        const code = params.get("code");
        let exchangeErrorMessage: string | null = null;
        if (code) {
          setMessage("Exchanging sign-in code…");
          const { error: exchangeError } =
            await client.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            // The code may already have been consumed by the GoTrue client's
            // internal _initialize(). In that case this is *not* a real error
            // — we still fall through to getSession().  If that also fails we
            // surface the exchange error as the actionable diagnostic.
            exchangeErrorMessage = exchangeError.message;
          }
        }

        // 2. Wait for the session to settle and read it
        const { data } = await client.auth.getSession();
        if (cancelled) return;
        const session = data?.session;

        if (!session) {
          const errorCode = exchangeErrorMessage
            ? `EXCHANGE_FAILED: ${exchangeErrorMessage}`
            : "NO_AUTH_SESSION_AFTER_CALLBACK";
          const redirectUrl = new URL(window.location.origin);
          redirectUrl.searchParams.set("authError", errorCode);
          window.location.replace(redirectUrl.toString());
          return;
        }

        // 3. Strip auth params from the URL and return to the console.
        window.history.replaceState({}, document.title, "/");
        setMessage("Signed in. Redirecting…");
        window.location.assign("/");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-b1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <ShieldOff className="w-8 h-8 text-er mx-auto mb-4" />
          <p className="text-nt text-sm font-mono mb-2">Sign-in failed</p>
          <p className="text-nt/60 text-xs font-mono break-all">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-b1 flex items-center justify-center p-6">
      <div className="text-center">
        <ShieldCheck className="w-8 h-8 text-ac mx-auto mb-4" />
        <div className="flex items-center justify-center gap-2 text-nt text-xs font-mono">
          <Loader2 className="w-4 h-4 animate-spin" />
          {message}
        </div>
      </div>
    </div>
  );
}
