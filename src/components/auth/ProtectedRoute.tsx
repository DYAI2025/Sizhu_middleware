import { type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuthState } from "../../lib/auth/authState";
import LoginView from "./LoginView";
import MfaSetupView from "./MfaSetupView";
import MfaChallengeView from "./MfaChallengeView";

/**
 * ProtectedRoute — frontend gate that mirrors (but does NOT replace) the
 * server-side policy. Real enforcement lives in the API middleware; this only
 * decides which screen the admin sees.
 *
 * Decision order:
 *  1. Not ready                 -> spinner
 *  2. Supabase not configured   -> render app (demo mode; server still gates APIs)
 *  3. Not logged in             -> LoginView
 *  4. Email not verified        -> LoginView (shows EMAIL_VERIFICATION_REQUIRED)
 *  5. MFA required & aal1:
 *        - factor enrolled      -> MfaChallengeView (step up)
 *        - no factor            -> MfaSetupView (enroll)
 *  6. Otherwise                 -> children
 */
export default function ProtectedRoute({
  children,
  enforceMfa = true,
}: {
  children: ReactNode;
  enforceMfa?: boolean;
}) {
  const auth = useAuthState();

  if (!auth.ready) {
    return (
      <div className="min-h-screen bg-b1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-ac animate-spin" />
      </div>
    );
  }

  // Demo mode without Supabase: the UI is usable but every admin API call is
  // still rejected server-side until credentials are configured.
  if (!auth.configured) {
    return <>{children}</>;
  }

  if (!auth.loggedIn || !auth.emailVerified) {
    return <LoginView />;
  }

  if (enforceMfa && auth.aal !== "aal2") {
    // nextAal === "aal2" means a verified factor exists and we just need to
    // step up; otherwise the user must enroll first.
    if (auth.mfaEnrolled || auth.nextAal === "aal2") {
      return <MfaChallengeView />;
    }
    return <MfaSetupView />;
  }

  return <>{children}</>;
}
