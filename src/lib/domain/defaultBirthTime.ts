/**
 * Bazzi Middleware Platform
 * Default Birth Time Constants and Fallback Policy
 *
 * Canonical CLIENT-SIDE default-noon source (FP2 / REQ-F-001). The runner and the
 * mock personalization provider are client-safe (`src/`) and import the noon value
 * from HERE rather than re-typing `'12:00'` inline.
 *
 * Two representations of the same "noon" concept exist by design:
 *  - {@link DEFAULT_BIRTH_TIME} = `"12:00"` — the human-facing display time (`HH:MM`)
 *    persisted on a `WorkflowRun` and echoed in personalization output.
 *  - `DEFAULT_NOON_TIME` = `"12:00:00"` in `server/contracts/fufireContract.ts` — the
 *    FuFire ISO time-component (`HH:MM:SS`) used to build outbound request bodies.
 * They are kept in sync (both 12:00 local wall-clock); the server contract owns the
 * ISO form so server-only code is never pulled into the client bundle.
 */

/** Display default-noon time, `HH:MM` (server ISO form: `DEFAULT_NOON_TIME` "12:00:00"). */
export const DEFAULT_BIRTH_TIME = "12:00";
export const DEFAULT_BIRTH_TIME_KNOWN = false;
export const DEFAULT_BIRTH_TIME_SOURCE = "default_noon";

export interface BirthTimeConfig {
  birth_time: string;
  birth_time_known: boolean;
  birth_time_source: string;
}

export const defaultBirthTimeFallback: BirthTimeConfig = {
  birth_time: DEFAULT_BIRTH_TIME,
  birth_time_known: DEFAULT_BIRTH_TIME_KNOWN,
  birth_time_source: DEFAULT_BIRTH_TIME_SOURCE
};
