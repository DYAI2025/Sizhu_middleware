import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "../../lib/auth/supabaseClient";

/**
 * AuthCallbackView — landing target for `/auth/callback`.
 *
 * Supabase's browser client (detectSessionInUrl) automatically exchanges the
 * code/hash in the URL for a session. We just wait for that to settle, clean the
 * URL, and bounce back to the app root.
 */
export default function AuthCallbackView() {
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    let cancelled = false;
    const client = getSupabaseClient();
    if (!client) {
      setMessage("Supabase is not configured.");
      return;
    }
    const run = async () => {
      try {
        await client.auth.getSession();
      } catch {
        /* detectSessionInUrl handles the exchange */
      }
      if (cancelled) return;
      // Strip auth params from the URL and return to the console.
      window.history.replaceState({}, document.title, "/");
      setMessage("Signed in. Redirecting…");
      // Force a re-render of the root app.
      window.location.assign("/");
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

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
