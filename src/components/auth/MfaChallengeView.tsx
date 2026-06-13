import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ShieldCheck, Loader2, KeyRound } from "lucide-react";
import {
  challengeTotp,
  getNextMfaFactorId,
  signOut,
} from "../../lib/auth/authState";

/**
 * MfaChallengeView — step up an existing aal1 session to aal2 by verifying a
 * TOTP code from the user's already-enrolled authenticator factor.
 */
export default function MfaChallengeView({ onDone }: { onDone?: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNextMfaFactorId().then((id) => {
      if (!cancelled) setFactorId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!factorId) {
      setError("No verified authenticator factor found. Please enroll first.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await challengeTotp(factorId, code.trim());
    setBusy(false);
    if (r.ok) onDone?.();
    else setError(r.error || "Invalid code. Try again.");
  };

  return (
    <div className="min-h-screen bg-b1 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-b2 border border-da rounded-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-6 h-6 text-ac" />
          <div>
            <h1 className="text-da font-bold font-mono text-sm uppercase tracking-wider">
              Two-factor verification
            </h1>
            <p className="text-nt text-[11px] font-mono">
              Enter the code from your authenticator app
            </p>
          </div>
        </div>

        <form onSubmit={verify} className="space-y-5">
          <div>
            <label className="block text-[10px] text-nt uppercase font-mono mb-1">
              6-digit code
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-nt absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full bg-b1 border border-da rounded-sm pl-9 pr-3 py-2 text-da text-sm font-mono tracking-[0.4em] text-center focus:outline-none focus:border-ac"
                placeholder="000000"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full py-2.5 bg-ac text-da text-xs font-bold rounded-sm uppercase font-mono flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Verify
          </button>
        </form>

        {error && <p className="text-red-400 text-[11px] mt-4 font-mono">{error}</p>}

        <button
          onClick={() => signOut()}
          className="mt-5 text-[11px] text-nt underline font-mono"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
