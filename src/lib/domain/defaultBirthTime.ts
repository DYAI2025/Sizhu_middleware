/**
 * Bazzi Middleware Platform
 * Default Birth Time Constants and Fallback Policy
 */

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
