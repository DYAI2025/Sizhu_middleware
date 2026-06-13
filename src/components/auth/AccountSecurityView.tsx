import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Trash2,
  RefreshCw,
} from "lucide-react";
import {
  useAuthState,
  listFactors,
  unenrollFactor,
  challengeTotp,
  signOut,
  FactorInfo,
} from "../../lib/auth/authState";
import MfaSetupView from "./MfaSetupView";

/**
 * AccountSecurityView — the Admin Security panel.
 *
 * Shows live auth state (logged-in, email verified, role, AAL, MFA enrolled),
 * lists factors, allows enrolling a new TOTP factor, and unenrolls a factor
 * ONLY after the user passes a fresh MFA confirmation.
 */
export default function AccountSecurityView() {
  const auth = useAuthState();
  const [factors, setFactors] = useState<FactorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [pendingUnenroll, setPendingUnenroll] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setFactors(await listFactors());
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, [auth.aal, auth.loggedIn]);

  const StatusRow = ({
    label,
    value,
    good,
  }: {
    label: string;
    value: string;
    good: boolean;
  }) => (
    <div className="flex items-center justify-between py-2 border-b border-da text-xs font-mono">
      <span className="text-nt uppercase tracking-wide text-[10px]">{label}</span>
      <span className={`flex items-center gap-1.5 ${good ? "text-ac" : "text-red-400"}`}>
        <span
          className={`w-1.5 h-1.5 rounded-full ${good ? "bg-ac" : "bg-red-400"}`}
        />
        {value}
      </span>
    </div>
  );

  const doUnenroll = async (e: FormEvent) => {
    e.preventDefault();
    if (!pendingUnenroll) return;
    setBusy(true);
    setError(null);
    // Require a fresh MFA confirmation before removing a factor.
    const verifiedFactor = factors.find(
      (f) => f.factorType === "totp" && f.status === "verified",
    );
    if (verifiedFactor) {
      const challenge = await challengeTotp(verifiedFactor.id, confirmCode.trim());
      if (!challenge.ok) {
        setBusy(false);
        setError(challenge.error || "MFA confirmation failed.");
        return;
      }
    }
    const r = await unenrollFactor(pendingUnenroll);
    setBusy(false);
    if (r.ok) {
      setPendingUnenroll(null);
      setConfirmCode("");
      await refresh();
    } else {
      setError(r.error || "Could not remove factor.");
    }
  };

  if (enrolling) {
    return (
      <div>
        <MfaSetupView
          onDone={() => {
            setEnrolling(false);
            void refresh();
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        {auth.aal === "aal2" ? (
          <ShieldCheck className="w-6 h-6 text-ac" />
        ) : (
          <ShieldAlert className="w-6 h-6 text-ac" />
        )}
        <div>
          <h2 className="text-da font-bold font-mono text-sm uppercase tracking-wider">
            Admin Security
          </h2>
          <p className="text-nt text-[11px] font-mono">
            Server-enforced authentication &amp; MFA state
          </p>
        </div>
      </div>

      <div className="bg-b2 border border-da rounded-md p-5 mb-6">
        <StatusRow
          label="Session"
          value={auth.loggedIn ? "Logged in" : "Not logged in"}
          good={auth.loggedIn}
        />
        <StatusRow
          label="Email"
          value={auth.emailVerified ? "Verified" : "Not verified"}
          good={auth.emailVerified}
        />
        <StatusRow label="Account" value={auth.email || "—"} good={!!auth.email} />
        <StatusRow label="Role" value={auth.role} good={auth.role === "owner" || auth.role === "admin" || auth.role === "operator"} />
        <StatusRow label="AAL Level" value={auth.aal} good={auth.aal === "aal2"} />
        <StatusRow
          label="MFA"
          value={auth.mfaEnrolled ? "Enrolled" : "Not enrolled"}
          good={auth.mfaEnrolled}
        />
      </div>

      <div className="bg-b2 border border-da rounded-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-da font-bold font-mono text-xs uppercase tracking-wider">
            Authenticator factors
          </h3>
          <button
            onClick={refresh}
            className="text-nt hover:text-da"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-nt text-xs font-mono">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading factors…
          </div>
        ) : factors.length === 0 ? (
          <p className="text-nt text-xs font-mono mb-4">
            No factors enrolled yet.
          </p>
        ) : (
          <ul className="space-y-2 mb-4">
            {factors.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between bg-b1 border border-da rounded-sm px-3 py-2 text-xs font-mono"
              >
                <span className="text-da">
                  {f.friendlyName || f.factorType.toUpperCase()}{" "}
                  <span className="text-nt">({f.status})</span>
                </span>
                <button
                  onClick={() => {
                    setPendingUnenroll(f.id);
                    setError(null);
                  }}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {pendingUnenroll ? (
          <form
            onSubmit={doUnenroll}
            className="bg-b1 border border-ac rounded-sm p-4 space-y-3"
          >
            <p className="text-[11px] text-ac font-mono">
              Confirm with your current authenticator code to remove this factor.
            </p>
            <input
              inputMode="numeric"
              maxLength={6}
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
              className="w-full bg-b2 border border-da rounded-sm px-3 py-2 text-da text-sm font-mono tracking-[0.3em] text-center focus:outline-none focus:border-ac"
              placeholder="000000"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="flex-1 py-2 bg-red-500 text-white text-[11px] font-bold rounded-sm uppercase font-mono disabled:opacity-50"
              >
                {busy ? "Removing…" : "Confirm removal"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingUnenroll(null);
                  setConfirmCode("");
                }}
                className="flex-1 py-2 bg-b2 border border-da text-nt text-[11px] font-bold rounded-sm uppercase font-mono"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setEnrolling(true)}
            className="w-full py-2.5 bg-ac text-da text-xs font-bold rounded-sm uppercase font-mono"
          >
            Enroll new authenticator (TOTP)
          </button>
        )}

        {error && <p className="text-red-400 text-[11px] mt-3 font-mono">{error}</p>}
      </div>

      <button
        onClick={() => signOut()}
        className="mt-6 text-[11px] text-nt underline font-mono"
      >
        Sign out of admin console
      </button>
    </div>
  );
}
