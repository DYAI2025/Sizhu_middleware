import { useEffect, useState } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  ADMIN_EMAIL_ALLOWLIST,
} from "./supabaseClient";

/**
 * authState — a tiny observable store over the Supabase browser session.
 *
 * It exposes everything the Admin Security panel and ProtectedRoute need:
 * logged-in status, email verification, display role, AAL (aal1/aal2) and MFA
 * enrollment. All sensitive authorization is still enforced by the server; the
 * role shown here is display-only and derived from VITE_ADMIN_EMAIL_ALLOWLIST.
 */

export type DisplayRole = "owner" | "admin" | "operator" | "viewer" | "none";

export interface AuthSnapshot {
  ready: boolean;
  configured: boolean;
  loggedIn: boolean;
  email: string | null;
  emailVerified: boolean;
  role: DisplayRole;
  /** "aal1" | "aal2" — current authenticator assurance level. */
  aal: string;
  /** Highest assurance level the user could reach (indicates MFA enrolled). */
  nextAal: string;
  mfaEnrolled: boolean;
  accessToken: string | null;
}

const initialSnapshot: AuthSnapshot = {
  ready: false,
  configured: isSupabaseConfigured(),
  loggedIn: false,
  email: null,
  emailVerified: false,
  role: "none",
  aal: "aal1",
  nextAal: "aal1",
  mfaEnrolled: false,
  accessToken: null,
};

let snapshot: AuthSnapshot = { ...initialSnapshot };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setSnapshot(patch: Partial<AuthSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  emit();
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot;
}

function deriveRole(email: string | null): DisplayRole {
  if (!email) return "none";
  if (ADMIN_EMAIL_ALLOWLIST.includes(email.trim().toLowerCase())) {
    return "owner";
  }
  return "viewer";
}

function isEmailVerified(user: User | null): boolean {
  if (!user) return false;
  if (user.email_confirmed_at) return true;
  if ((user as unknown as { confirmed_at?: string }).confirmed_at) return true;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  return meta?.email_verified === true;
}

async function refreshAssurance(): Promise<{ aal: string; nextAal: string; mfaEnrolled: boolean }> {
  const client = getSupabaseClient();
  if (!client) return { aal: "aal1", nextAal: "aal1", mfaEnrolled: false };
  try {
    const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    const factors = await client.auth.mfa.listFactors();
    const verifiedTotp = (factors.data?.totp || []).filter(
      (f) => f.status === "verified",
    );
    return {
      aal: data?.currentLevel || "aal1",
      nextAal: data?.nextLevel || "aal1",
      mfaEnrolled: verifiedTotp.length > 0,
    };
  } catch {
    return { aal: "aal1", nextAal: "aal1", mfaEnrolled: false };
  }
}

async function applySession(session: Session | null) {
  const user = session?.user ?? null;
  const email = user?.email ?? null;
  const assurance = session ? await refreshAssurance() : {
    aal: "aal1",
    nextAal: "aal1",
    mfaEnrolled: false,
  };
  setSnapshot({
    ready: true,
    configured: isSupabaseConfigured(),
    loggedIn: Boolean(session),
    email,
    emailVerified: isEmailVerified(user),
    role: deriveRole(email),
    accessToken: session?.access_token ?? null,
    ...assurance,
  });
}

let initialized = false;

/** Idempotently wire up Supabase auth listeners and load the current session. */
export function initAuth(): void {
  if (initialized) return;
  initialized = true;

  const client = getSupabaseClient();
  if (!client) {
    setSnapshot({ ready: true, configured: false });
    return;
  }

  client.auth.getSession().then(({ data }) => {
    void applySession(data.session);
  });

  client.auth.onAuthStateChange((_event, session) => {
    void applySession(session);
  });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook returning the live auth snapshot. */
export function useAuthState(): AuthSnapshot {
  const [snap, setSnap] = useState<AuthSnapshot>(snapshot);
  useEffect(() => {
    initAuth();
    setSnap(snapshot);
    return subscribe(() => setSnap(getAuthSnapshot()));
  }, []);
  return snap;
}

// ---------------------------------------------------------------------------
// Auth actions
// ---------------------------------------------------------------------------

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function configError(): ActionResult {
  return { ok: false, error: "SUPABASE_NOT_CONFIGURED" };
}

function toMessage(error: AuthError | null): string | undefined {
  return error ? error.message : undefined;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<ActionResult> {
  const client = getSupabaseClient();
  if (!client) return configError();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<ActionResult> {
  const client = getSupabaseClient();
  if (!client) return configError();
  const { error } = await client.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function sendMagicLink(email: string): Promise<ActionResult> {
  const client = getSupabaseClient();
  if (!client) return configError();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<ActionResult> {
  const client = getSupabaseClient();
  if (!client) return configError();
  const { error } = await client.auth.signOut();
  return { ok: !error, error: toMessage(error) };
}

export async function resendVerificationEmail(email: string): Promise<ActionResult> {
  const client = getSupabaseClient();
  if (!client) return configError();
  const { error } = await client.auth.resend({ type: "signup", email });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// MFA (TOTP / authenticator app)
// ---------------------------------------------------------------------------

export interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

export interface EnrollResult {
  ok: boolean;
  enrollment?: TotpEnrollment;
  error?: string;
}

export async function enrollTotp(): Promise<EnrollResult> {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: "SUPABASE_NOT_CONFIGURED" };
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data) return { ok: false, error: error?.message || "ENROLL_FAILED" };
  return {
    ok: true,
    enrollment: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    },
  };
}

export async function verifyTotpEnrollment(
  factorId: string,
  code: string,
): Promise<ActionResult> {
  const client = getSupabaseClient();
  if (!client) return configError();
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, error: error.message };
  await applySession((await client.auth.getSession()).data.session);
  return { ok: true };
}

export async function challengeTotp(
  factorId: string,
  code: string,
): Promise<ActionResult> {
  const client = getSupabaseClient();
  if (!client) return configError();
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ok: false, error: error.message };
  await applySession((await client.auth.getSession()).data.session);
  return { ok: true };
}

export interface FactorInfo {
  id: string;
  friendlyName: string | null;
  factorType: string;
  status: string;
}

export async function listFactors(): Promise<FactorInfo[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data } = await client.auth.mfa.listFactors();
  const all = data?.all || [];
  return all.map((f) => ({
    id: f.id,
    friendlyName: f.friendly_name ?? null,
    factorType: f.factor_type,
    status: f.status,
  }));
}

/**
 * Unenroll a factor. This should only be called after a fresh MFA confirmation
 * (the UI requires the user to pass an MFA challenge first).
 */
export async function unenrollFactor(factorId: string): Promise<ActionResult> {
  const client = getSupabaseClient();
  if (!client) return configError();
  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, error: error.message };
  await applySession((await client.auth.getSession()).data.session);
  return { ok: true };
}

export async function getNextMfaFactorId(): Promise<string | null> {
  const factors = await listFactors();
  const verified = factors.find((f) => f.factorType === "totp" && f.status === "verified");
  return verified?.id ?? null;
}
