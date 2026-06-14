/**
 * FuFire wuxing location-sensitivity probe (REQ-F-002 / AC-F-002f resolution).
 *
 * The live smoke surfaced that the wuxing response for Berlin (52.52,13.405) was
 * byte-identical to the captured 0,0 sample (same wu_xing_vector, true_solar_time,
 * equation_of_time). That leaves a fork the smoke could not resolve:
 *   (A) wuxing is LOCATION-INVARIANT (geocentric planet positions depend on the
 *       instant, not the observer's lat/lon) → identical output is CORRECT, and
 *       AC-F-002f's "0,0 trap = wrong-location data" premise is FALSE.
 *   (B) the API IGNORES / caches coordinates → a real integration bug; binding
 *       dominant_element is unsafe.
 *
 * This probe calls wuxing at THREE distinct locations, same instant, and diffs the
 * location-sensitive outputs. Identical across all three ⇒ (A). Differing ⇒ (B).
 * It does NOT flip any ledger — it is decision evidence for the user.
 *
 * Run: npm run probe:fufire-location
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function loadDotEnv(file = resolve(REPO_ROOT, ".env")): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
function bridge(): void {
  if (!process.env.FUFIRE_BASE_URL && process.env.FUFIRE_API_URL) process.env.FUFIRE_BASE_URL = process.env.FUFIRE_API_URL;
  const ref = process.env.FUFIRE_API_KEY_SECRET_REF || "SECRET_REF_FUFIRE_API_KEY";
  if (!process.env[ref] && process.env.FUFIRE_API_KEY) process.env[ref] = process.env.FUFIRE_API_KEY;
}

const LOCATIONS = [
  { name: "Berlin", lat: 52.52, lon: 13.405, tz: "Europe/Berlin" },
  { name: "Sydney", lat: -33.8688, lon: 151.2093, tz: "Australia/Sydney" },
  { name: "Quito", lat: -0.1807, lon: -78.4678, tz: "America/Guayaquil" },
];

async function main(): Promise<void> {
  loadDotEnv();
  bridge();
  const { FuFireDataService } = await import("../../server/services/fufireDataService");
  const svc = new FuFireDataService();

  const rows: Array<Record<string, unknown>> = [];
  for (const loc of LOCATIONS) {
    const res = await svc.executeTestRun({
      birthDate: "1990-06-15",
      birthTime: "14:30",
      birthTimeKnown: true,
      manualLat: loc.lat,
      manualLon: loc.lon,
      manualTimezone: loc.tz,
      requestedOperations: ["wuxing"],
    } as any);
    const w = res.responses.find((r) => r.operation === "wuxing" && "data" in r)?.data as any;
    rows.push({
      loc: loc.name,
      echoedLat: w?.input?.lat,
      echoedLon: w?.input?.lon,
      dominant: w?.dominant_element,
      true_solar_time: w?.true_solar_time,
      eot: w?.equation_of_time,
      vectorHolz: w?.wu_xing_vector?.Holz,
      vectorHash: w ? JSON.stringify(w.wu_xing_vector) : "(no data)",
      gatewayIssue: res.gatewayIssues[0]?.errorCode,
    });
  }

  console.log("── wuxing location-sensitivity probe (same instant, 3 locations) ──");
  for (const r of rows) {
    console.log(
      `${String(r.loc).padEnd(7)} echoed=${r.echoedLat},${r.echoedLon}  dominant=${r.dominant}  ` +
        `tst=${r.true_solar_time}  eot=${r.eot}  Holz=${r.vectorHolz}${r.gatewayIssue ? `  issue=${r.gatewayIssue}` : ""}`,
    );
  }

  // Time-sensitivity control: same Berlin location, a DIFFERENT instant. A real
  // computing engine must produce a different western vector for a different date;
  // identical output here would mean hardcoded/cached data (rules out that fork).
  const altDates = ["1990-06-15", "1975-11-23"];
  const tstByDate: string[] = [];
  const vecByDate: string[] = [];
  for (const d of altDates) {
    const res = await svc.executeTestRun({
      birthDate: d,
      birthTime: "14:30",
      birthTimeKnown: true,
      manualLat: 52.52,
      manualLon: 13.405,
      manualTimezone: "Europe/Berlin",
      requestedOperations: ["wuxing"],
    } as any);
    const w = res.responses.find((r) => r.operation === "wuxing" && "data" in r)?.data as any;
    tstByDate.push(String(w?.true_solar_time));
    vecByDate.push(JSON.stringify(w?.wu_xing_vector));
    console.log(`date ${d}: dominant=${w?.dominant_element} Holz=${w?.wu_xing_vector?.Holz} tst=${w?.true_solar_time}`);
  }
  const timeSensitive = new Set(vecByDate).size > 1;
  console.log(`time-sensitive (vector changes with date): ${timeSensitive}`);

  const vectors = new Set(rows.map((r) => r.vectorHash));
  const tsts = new Set(rows.map((r) => String(r.true_solar_time)));
  const allEchoedCorrectly = rows.every(
    (r, i) => r.echoedLat === LOCATIONS[i].lat && r.echoedLon === LOCATIONS[i].lon,
  );

  console.log("──────────────────────────────────────────────────────────────");
  console.log(`coords echoed correctly per location : ${allEchoedCorrectly}`);
  console.log(`distinct wu_xing_vector outputs        : ${vectors.size} of ${rows.length}`);
  console.log(`distinct true_solar_time outputs       : ${tsts.size} of ${rows.length}`);
  if (vectors.size === 1 && tsts.size === 1) {
    console.log("CONCLUSION: (A) wuxing output is LOCATION-INVARIANT at this instant.");
    console.log("  → identical Berlin/0,0 output is CORRECT (geocentric); AC-F-002f's");
    console.log("    'wrong-location data' premise does NOT hold for wuxing dominant_element.");
  } else if (tsts.size > 1 || vectors.size > 1) {
    console.log("CONCLUSION: (B) wuxing output VARIES by location.");
    console.log("  → the Berlin≡0,0 identity from the smoke indicates a caching/echo/coord-ignore");
    console.log("    issue worth investigating before binding dominant_element.");
  }
}

main().catch((e) => {
  console.error("probe crashed:", e?.message ?? e);
  process.exit(2);
});
