import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FuFireDataService } from "../services/fufireDataService";
import {
  buildChronometryRequest,
  buildWuxingRequest,
} from "../services/fufireRequestBuilders";
import type { NormalizedBirthInput } from "../services/fufireRequestBuilders";

/**
 * FP1 — FuFire data-request boundary hardening (REQ-F-001 / REQ-A-001).
 *
 * Companion to the tester-authored contract `fufire.requestBuilders.test.ts`
 * (which must NOT be edited). This file pins the FP1 hardening behaviours that
 * file does not cover:
 *
 *  (a) A single-coordinate test-run input (manualLat present, manualLon
 *      undefined — or vice-versa) is rejected with the controlled
 *      NO_GEOCODER_CONFIGURED gateway issue and produces NO outbound fetch /
 *      malformed request body. Mutation check: reverting the service gate from
 *      `||` back to `&&` turns (a) RED (a half-coord input would slip past and
 *      attempt an outbound call with `{lon: undefined}`).
 *  (b) The request builder, given a FULL Berlin input, emits the optional enum
 *      fields PRESENT and EQUAL to the supplied values — the non-optional
 *      (unconditional) version of the contract test's `if (...) expect(...)`
 *      conditional. Builders never emit `{lon: undefined}`.
 *  (c) No `FUFIRE_API_KEY` bare-fallback path: with only `FUFIRE_API_KEY` set
 *      (and the configured secretRef env var ABSENT), the run must surface
 *      NO_FUFIRE_API_KEY_CONFIGURED — the key is read solely from the configured
 *      secretRef, never the bare `FUFIRE_API_KEY` fallback.
 *
 * Evidence class: integration-fake / pure-logic. `fetch` is stubbed so we can
 * assert it is NEVER called on the rejected paths (no live network).
 */

const ENV_KEYS = [
  "FUFIRE_API_KEY",
  "FUFIRE_API_KEY_SECRET_REF",
  "SECRET_REF_FUFIRE_API_KEY",
  "FUFIRE_BASE_URL",
];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

const FULL_BERLIN_INPUT = {
  birthDate: "1990-06-15",
  birthTime: "14:30",
  birthTimeKnown: true,
  manualLat: 52.52,
  manualLon: 13.405,
  manualTimezone: "Europe/Berlin",
  requestedOperations: ["bazi"],
};

describe("FP1 (a) — half-coordinate input is rejected with NO_GEOCODER_CONFIGURED, no outbound call", () => {
  it("manualLat present, manualLon undefined → NO_GEOCODER_CONFIGURED gateway issue, fetch never called", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const svc = new FuFireDataService();

    const result = await svc.executeTestRun({
      birthDate: "1990-06-15",
      birthTime: "14:30",
      birthTimeKnown: true,
      manualLat: 52.52, // present
      // manualLon: undefined — MISSING
      manualTimezone: "Europe/Berlin",
      requestedOperations: ["wuxing"],
    });

    expect(result.gatewayIssues).toHaveLength(1);
    expect(result.gatewayIssues[0].errorCode).toBe("NO_GEOCODER_CONFIGURED");
    expect(result.requests).toEqual([]);
    expect(result.responses).toEqual([]);
    expect(result.readinessStatus).toBe("NOT_READY");
    // No outbound fetch / no malformed `{lon: undefined}` body ever attempted.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("manualLon present, manualLat undefined → NO_GEOCODER_CONFIGURED gateway issue, fetch never called", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const svc = new FuFireDataService();

    const result = await svc.executeTestRun({
      birthDate: "1990-06-15",
      birthTime: "14:30",
      birthTimeKnown: true,
      // manualLat: undefined — MISSING
      manualLon: 13.405, // present
      manualTimezone: "Europe/Berlin",
      requestedOperations: ["wuxing"],
    });

    expect(result.gatewayIssues).toHaveLength(1);
    expect(result.gatewayIssues[0].errorCode).toBe("NO_GEOCODER_CONFIGURED");
    expect(result.requests).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("both coordinates undefined → still NO_GEOCODER_CONFIGURED (preserved path)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const svc = new FuFireDataService();

    const result = await svc.executeTestRun({
      birthDate: "1990-06-15",
      birthTimeKnown: false,
      requestedOperations: ["wuxing"],
    });

    expect(result.gatewayIssues[0].errorCode).toBe("NO_GEOCODER_CONFIGURED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("FP1 (b) — full Berlin input emits optional enum fields present + equal (non-optional assertion)", () => {
  const FULL: NormalizedBirthInput = {
    birthDate: "1990-06-15",
    birthTime: "14:30",
    birthTimeKnown: true,
    lat: 52.52,
    lon: 13.405,
    timezone: "Europe/Berlin",
    standard: "CIVIL",
    boundary: "midnight",
    ambiguousTime: "earlier",
    nonexistentTime: "error",
  };

  it("chronometry builder emits lat/lon/timezone present + equal (never {lon: undefined})", () => {
    const body = buildChronometryRequest({
      ...FULL,
      lat: 52.52,
      lon: 13.405,
      timezone: "Europe/Berlin",
    });
    expect(body.birth.location.lat).toBe(52.52);
    expect(body.birth.location.lon).toBe(13.405);
    expect(body.birth.timezone).toBe("Europe/Berlin");
    // No undefined keys leaked into the location object.
    expect(Object.values(body.birth.location)).not.toContain(undefined);
  });

  it("wuxing builder emits lat/lon present + equal; optional enums present + equal when supplied", () => {
    const body = buildWuxingRequest({
      ...FULL,
      lat: 52.52,
      lon: 13.405,
    });
    expect(body.lat).toBe(52.52);
    expect(body.lon).toBe(13.405);
    // Non-optional (unconditional) assertion: the supplied enums ARE present.
    expect(body.ambiguousTime).toBe("earlier");
    expect(body.nonexistentTime).toBe("error");
    expect(body.tz).toBe("Europe/Berlin");
    expect(JSON.stringify(body)).not.toContain("undefined");
  });
});

describe("FP1 (c) — no FUFIRE_API_KEY bare-fallback path", () => {
  it("with only FUFIRE_API_KEY set and the configured secretRef env ABSENT → NO_FUFIRE_API_KEY_CONFIGURED", async () => {
    // Bare FUFIRE_API_KEY is set, but the resolved secretRef
    // (SECRET_REF_FUFIRE_API_KEY by default) is NOT — the old `|| FUFIRE_API_KEY`
    // fallback would have picked this up; the hardened code must NOT.
    process.env.FUFIRE_API_KEY = "bare-fallback-key-MUST-NOT-BE-USED";
    process.env.FUFIRE_BASE_URL = "https://api.example.test";
    delete process.env.SECRET_REF_FUFIRE_API_KEY;
    delete process.env.FUFIRE_API_KEY_SECRET_REF;

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const svc = new FuFireDataService();

    const result = await svc.executeTestRun(FULL_BERLIN_INPUT);

    const codes = result.gatewayIssues.map((i: { errorCode: string }) => i.errorCode);
    expect(codes).toContain("NO_FUFIRE_API_KEY_CONFIGURED");
    // The bare key value must never appear anywhere in the result.
    expect(JSON.stringify(result)).not.toContain("bare-fallback-key-MUST-NOT-BE-USED");
    // And no outbound call was attempted without a configured key.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
