import { useState } from "react";
import type { FormEvent } from "react";
import { ShieldCheck, Loader2, QrCode } from "lucide-react";
import {
  enrollTotp,
  verifyTotpEnrollment,
  signOut,
  TotpEnrollment,
} from "../../lib/auth/authState";

/**
 * MfaSetupView — enroll a TOTP / authenticator-app factor.
 *
 * Flow: enroll -> render QR + secret -> user scans -> user enters 6-digit code
 * -> challengeAndVerify. On success the session is upgraded toward aal2.
 */
export default function MfaSetupView({ onDone }: { onDone?: () => void }) {
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = async () => {
    setBusy(true);
    setError(null);
    const r = await enrollTotp();
    setBusy(false);
    if (r.ok) setEnrollment(r.enrollment);
    else setError(r.error);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    const r = await verifyTotpEnrollment(enrollment.factorId, code.trim());
    setBusy(false);
    if (r.ok) {
      onDone?.();
    } else {
      setError(r.error || "Verification failed. Check the 6-digit code.");
    }
  };

  return (
    <div className="min-h-screen bg-b1 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-b2 border border-da rounded-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-6 h-6 text-ac" />
          <div>
            <h1 className="text-da font-bold font-mono text-sm uppercase tracking-wider">
              Set up two-factor auth
            </h1>
            <p className="text-nt text-[11px] font-mono">
              Required for sensitive admin actions
            </p>
          </div>
        </div>

        {!enrollment ? (
          <>
            <p className="text-nt text-xs mb-5">
              Use an authenticator app (Google Authenticator, 1Password, Authy)
              to protect FuFire, OpenRouter, provider config and POD dispatch.
            </p>
            <button
              onClick={begin}
              disabled={busy}
              className="w-full py-2.5 bg-ac text-da text-xs font-bold rounded-sm uppercase font-mono flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
              Begin TOTP enrollment
            </button>
          </>
        ) : (
          <form onSubmit={verify} className="space-y-5">
            <div className="bg-b1 border border-da rounded-sm p-4 flex flex-col items-center">
              {/* Supabase returns the QR code as an inline SVG data URI. */}
              {enrollment.qrCode ? (
                <img
                  src={enrollment.qrCode}
                  alt="TOTP QR code"
                  className="w-44 h-44 bg-white p-2 rounded"
                />
              ) : null}
              <p className="text-[10px] text-nt font-mono mt-3 break-all text-center">
                Secret: <span className="text-da">{enrollment.secret}</span>
              </p>
            </div>

            <div>
              <label className="block text-[10px] text-nt uppercase font-mono mb-1">
                6-digit code
              </label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full bg-b1 border border-da rounded-sm px-3 py-2 text-da text-sm font-mono tracking-[0.4em] text-center focus:outline-none focus:border-ac"
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="w-full py-2.5 bg-ac text-da text-xs font-bold rounded-sm uppercase font-mono flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Verify & enable
            </button>
          </form>
        )}

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
