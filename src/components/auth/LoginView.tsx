import { useState } from "react";
import type { FormEvent } from "react";
import { ShieldCheck, Mail, Loader2, AlertTriangle } from "lucide-react";
import {
  signInWithPassword,
  signUpWithPassword,
  sendMagicLink,
  resendVerificationEmail,
  signOut,
  useAuthState,
} from "../../lib/auth/authState";
import { isSupabaseConfigured } from "../../lib/auth/supabaseClient";

type Mode = "signin" | "signup" | "magic";

/**
 * LoginView — email + password (with magic-link and sign-up options).
 *
 * SECURITY: this view only ever touches the public anon key via the Supabase
 * browser client. No privileged server credential or secret is referenced here.
 */
export default function LoginView() {
  const auth = useAuthState();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  // Logged in but email not verified — surface the canonical state code.
  if (auth.loggedIn && !auth.emailVerified) {
    return (
      <div className="min-h-screen bg-b1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-b2 border border-da rounded-md p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-ac mx-auto mb-4" />
          <h1 className="text-da font-bold font-mono text-sm uppercase tracking-wider">
            EMAIL_VERIFICATION_REQUIRED
          </h1>
          <p className="text-nt text-xs mt-3">
            Please confirm your email ({auth.email}) before accessing the admin
            console. Check your inbox for the verification link.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setNotice(null);
              setError(null);
              const r = await resendVerificationEmail(auth.email || email);
              setBusy(false);
              if (r.ok) setNotice("Verification email re-sent.");
              else setError(r.error || "Could not resend email.");
            }}
            className="mt-5 w-full py-2 bg-ac text-da text-xs font-bold rounded-sm uppercase font-mono disabled:opacity-50"
          >
            Resend verification email
          </button>
          {notice && <p className="text-ac text-[11px] mt-3">{notice}</p>}
          {error && <p className="text-red-400 text-[11px] mt-3">{error}</p>}
          <button
            onClick={() => signOut()}
            className="mt-4 text-[11px] text-nt underline font-mono"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "magic") {
        const r = await sendMagicLink(email);
        if (r.ok) setNotice("Magic link sent. Check your email.");
        else setError(r.error || "Could not send magic link.");
      } else if (mode === "signup") {
        const r = await signUpWithPassword(email, password);
        if (r.ok)
          setNotice("Account created. Verify your email, then sign in.");
        else setError(r.error || "Sign up failed.");
      } else {
        const r = await signInWithPassword(email, password);
        if (!r.ok) setError(r.error || "Sign in failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-b1 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-b2 border border-da rounded-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-6 h-6 text-ac" />
          <div>
            <h1 className="text-da font-bold font-mono text-sm uppercase tracking-wider">
              Sizhu Admin
            </h1>
            <p className="text-nt text-[11px] font-mono">Secure console login</p>
          </div>
        </div>

        {!configured && (
          <div className="mb-4 p-3 bg-b1 border border-ac rounded-sm text-[11px] text-ac font-mono">
            Supabase is not configured. Set VITE_SUPABASE_URL and
            VITE_SUPABASE_ANON_KEY to enable login.
          </div>
        )}

        <div className="flex gap-2 mb-5 text-[11px] font-mono">
          {(["signin", "signup", "magic"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
                setNotice(null);
              }}
              className={`px-3 py-1 rounded-sm uppercase tracking-wide ${
                mode === m
                  ? "bg-ac text-da font-bold"
                  : "bg-b1 text-nt border border-da"
              }`}
            >
              {m === "signin" ? "Sign in" : m === "signup" ? "Sign up" : "Magic link"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-[10px] text-nt uppercase font-mono mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-b1 border border-da rounded-sm px-3 py-2 text-da text-xs font-mono focus:outline-none focus:border-ac"
              placeholder="admin@example.com"
              autoComplete="email"
            />
          </div>

          {mode !== "magic" && (
            <div>
              <label className="block text-[10px] text-nt uppercase font-mono mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-b1 border border-da rounded-sm px-3 py-2 text-da text-xs font-mono focus:outline-none focus:border-ac"
                placeholder="••••••••"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !configured}
            className="w-full py-2.5 bg-ac text-da text-xs font-bold rounded-sm uppercase font-mono flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === "magic" ? (
              <Mail className="w-4 h-4" />
            ) : null}
            {mode === "signin"
              ? "Sign in"
              : mode === "signup"
                ? "Create account"
                : "Send magic link"}
          </button>
        </form>

        {error && <p className="text-red-400 text-[11px] mt-4 font-mono">{error}</p>}
        {notice && <p className="text-ac text-[11px] mt-4 font-mono">{notice}</p>}
      </div>
    </div>
  );
}
